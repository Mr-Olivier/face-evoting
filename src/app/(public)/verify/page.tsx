"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Circle,
  CircleCheck,
  Eye,
  EyeOff,
  IdCard,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  UserX,
} from "lucide-react";
import FaceCamera from "@/components/FaceCamera";
import { Alert, Field, ProblemAlert, Steps, fieldProps } from "@/components/ui";
import { averageDescriptors, createBlinkDetector, createHeadTurnDetector, warmUp, type ScanResult } from "@/lib/face-pipeline";
import { ApiError, callApi } from "@/lib/client-api";
import { digitsOnly, formatNationalId, nationalIdProblem } from "@/lib/rwanda";

type Stage = "identify" | "confirm" | "not-me" | "face" | "submitting";
type Profile = {
  firstName: string;
  lastName: string;
  voterNumber: string;
  nationalId: string;
  dateOfBirth: string;
  sex: string;
  address: { province: string; district: string; sector: string; cell: string; village: string };
  phone: string;
  email: string | null;
};
type Problem = { message: string; hint?: string };

const STEPS = ["Identify", "Confirm details", "Face check", "Vote"];

export default function VerifyPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("identify");
  const [nationalId, setNationalId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [touched, setTouched] = useState<{ nationalId?: boolean; pin?: boolean }>({});
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [electionTitle, setElectionTitle] = useState("");

  const [cameraReady, setCameraReady] = useState(false);
  const [faceSeen, setFaceSeen] = useState(false);
  const [singleFace, setSingleFace] = useState(false);
  // "blinked" = liveness passed (by a blink, or by the head-turn backup challenge)
  const [blinked, setBlinked] = useState(false);
  const [livenessBy, setLivenessBy] = useState<"blink" | "turn" | null>(null);
  const [showTurnHint, setShowTurnHint] = useState(false);
  const [turnProgress, setTurnProgress] = useState(0);
  const blink = useRef(createBlinkDetector());
  const headTurn = useRef(createHeadTurnDetector());
  const faceSince = useRef<number | null>(null);

  // Load and warm up the face models while the voter types their ID and PIN,
  // so the camera starts checking immediately.
  useEffect(() => {
    warmUp().catch(() => {});
  }, []);
  const recent = useRef<number[][]>([]);
  const submitted = useRef(false);

  // ---------- Step 1: credentials ----------
  const nidDigits = digitsOnly(nationalId);
  const clientErrors = {
    nationalId: nationalIdProblem(nidDigits) ?? undefined,
    pin: /^\d{6}$/.test(pin) ? undefined : pin.length === 0 ? "Enter your 6-digit PIN." : `Your PIN has 6 digits. You entered ${pin.length}.`,
  };
  const errors = {
    nationalId: (touched.nationalId && clientErrors.nationalId) || serverFieldErrors.nationalId,
    pin: (touched.pin && clientErrors.pin) || serverFieldErrors.pin,
  };

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ nationalId: true, pin: true });
    setServerFieldErrors({});
    setProblem(null);
    if (clientErrors.nationalId || clientErrors.pin) return;
    setLoading(true);
    try {
      const data = await callApi<{ profile: Profile; election: { title: string } }>("/api/voters/lookup", { body: { nationalId: nidDigits, pin } });
      setProfile(data.profile);
      setElectionTitle(data.election.title);
      setStage("confirm");
    } catch (err) {
      if (err instanceof ApiError) {
        setServerFieldErrors(err.fieldErrors);
        setProblem({ message: err.message, hint: err.hint });
        if (err.code === "WRONG_PIN") setPin("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function cancel(to: Stage = "identify") {
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
    setProfile(null);
    setPin("");
    setStage(to);
  }

  // ---------- Step 3: face ----------
  function restartFace() {
    blink.current.reset();
    headTurn.current.reset();
    faceSince.current = null;
    setLivenessBy(null);
    setShowTurnHint(false);
    setTurnProgress(0);
    recent.current = [];
    submitted.current = false;
    setBlinked(false);
    setFaceSeen(false);
    setSingleFace(false);
    setStage("face");
  }

  const submitFace = useCallback(
    async (descriptor: number[]) => {
      setStage("submitting");
      try {
        await callApi("/api/voters/verify", { body: { descriptor, livenessPassed: true } });
        router.push("/vote");
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError("ERROR", "Verification failed.", 0);
        setProblem({ message: e.message, hint: e.hint });
        if (["SESSION_EXPIRED", "LOCKED", "NOT_ELIGIBLE", "NO_OPEN_ELECTION", "ALREADY_VOTED"].includes(e.code) || (e.code === "FACE_MISMATCH" && Number(e.data.remaining) <= 0)) {
          setProfile(null);
          setPin("");
          setStage("identify");
        } else {
          restartFace();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  const onScan = useCallback(
    (r: ScanResult) => {
      if (submitted.current) return;
      setFaceSeen(r.boxes.length > 0);
      setSingleFace(r.status === "ok");
      if (r.status !== "ok") return;
      if (!blink.current.passed && !headTurn.current.passed) {
        faceSince.current ??= Date.now();
        // Offer the head-turn challenge if no blink was seen within 3 s.
        if (Date.now() - faceSince.current > 3000) setShowTurnHint(true);
        if (blink.current.push(r.ear)) {
          setLivenessBy("blink");
          setBlinked(true);
        } else if (headTurn.current.push(r.yaw)) {
          setLivenessBy("turn");
          setBlinked(true);
        }
        setTurnProgress(Math.round(headTurn.current.progress * 10) / 10);
        return;
      }
      // After liveness, collect 3 frames WITH a face signature and send their average.
      if (r.descriptor.length !== 128) return; // frame analysed in fast mode just before the switch
      recent.current.push(r.descriptor);
      if (recent.current.length >= 3) {
        submitted.current = true;
        submitFace(averageDescriptors(recent.current));
      }
    },
    [submitFace],
  );

  const stepIndex = stage === "identify" ? 0 : stage === "confirm" || stage === "not-me" ? 1 : 2;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verify your identity</h1>
          <p className="mt-1 text-muted">Have your National ID card and your 6-digit voter PIN ready. This takes about a minute.</p>
        </div>
        <Steps current={stepIndex} steps={STEPS} />
      </div>

      {stage === "identify" && (
        <div className="mx-auto max-w-md space-y-4">
          <ProblemAlert problem={problem} />
          {problem && /PIN/.test(problem.message) && (
            <Link href="/forgot-pin" className="btn-secondary w-full">
              Reset my PIN by email
            </Link>
          )}
          <div className="card p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <IdCard className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Identify yourself</h2>
                <p className="text-sm text-muted">Use the number printed on your Rwandan National ID.</p>
              </div>
            </div>
            <form className="space-y-5" onSubmit={lookup} noValidate>
              <Field id="nationalId" label="National ID number" error={errors.nationalId} hint="16 digits, e.g. 1 1990 8 0012345 0 12">
                <input
                  {...fieldProps("nationalId", errors.nationalId)}
                  className={`${fieldProps("nationalId", errors.nationalId).className} font-mono tracking-wider`}
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="1 •••• • ••••••• • ••"
                  value={formatNationalId(nationalId)}
                  onChange={(e) => {
                    setNationalId(digitsOnly(e.target.value).slice(0, 16));
                    setServerFieldErrors((f) => ({ ...f, nationalId: "" }));
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, nationalId: true }))}
                />
              </Field>
              <Field
                id="pin"
                label="Voter PIN"
                error={errors.pin}
                hint={
                  <>
                    The 6-digit PIN you chose at registration.{" "}
                    <Link href="/forgot-pin" className="font-medium text-primary hover:underline">
                      Forgot your PIN?
                    </Link>
                  </>
                }
              >
                <div className="relative">
                  <input
                    {...fieldProps("pin", errors.pin)}
                    className={`${fieldProps("pin", errors.pin).className} pr-11 font-mono tracking-[0.4em]`}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="••••••"
                    value={pin}
                    onChange={(e) => {
                      setPin(digitsOnly(e.target.value).slice(0, 6));
                      setServerFieldErrors((f) => ({ ...f, pin: "" }));
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, pin: true }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-subtle hover:text-text"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {loading ? "Checking the register…" : "Continue"}
                {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
            </form>
          </div>
          <p className="flex items-start gap-2 text-xs text-subtle">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Five failed attempts lock your National ID for 15 minutes. Election officers will never ask for your PIN.
          </p>
        </div>
      )}

      {stage === "confirm" && profile && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-border bg-surface-2 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Voter register · {electionTitle}</p>
              <h2 className="mt-1 text-lg font-bold">Is this you?</h2>
              <p className="text-sm text-muted">Check that these registered details are yours before continuing.</p>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <dl className="space-y-3 text-sm">
                <Detail label="Full name" value={`${profile.firstName} ${profile.lastName}`} strong />
                <Detail label="National ID" value={profile.nationalId} mono />
                <Detail label="Date of birth" value={profile.dateOfBirth} />
                <Detail label="Sex" value={profile.sex} />
                <Detail label="Voter number" value={profile.voterNumber} mono />
              </dl>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-subtle">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Registered address
                  </dt>
                  <dd className="mt-1 font-medium leading-relaxed">
                    {profile.address.village} village, {profile.address.cell} cell
                    <br />
                    {profile.address.sector} sector, {profile.address.district} district
                    <br />
                    {profile.address.province}
                  </dd>
                </div>
                <Detail label="Phone" value={profile.phone} mono />
                <Detail label="Email" value={profile.email ?? "Not provided"} />
              </dl>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-border p-6 sm:flex-row sm:justify-between">
              <button className="btn-secondary" onClick={() => cancel("not-me")}>
                <UserX className="h-4 w-4" aria-hidden /> These aren&apos;t my details
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setProblem(null);
                  setCameraReady(false);
                  restartFace();
                }}
              >
                Yes, this is me <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <p className="text-xs text-subtle">Some details are partly hidden to protect your privacy. You have 5 minutes to complete the face check.</p>
        </div>
      )}

      {stage === "not-me" && (
        <div className="card mx-auto max-w-lg space-y-4 p-8">
          <h2 className="text-lg font-bold">Your session has been closed</h2>
          <p className="text-sm text-muted">
            If the National ID and PIN are yours but the details are wrong, your record needs correcting. If you entered someone else&apos;s National ID, nothing has been recorded.
          </p>
          <Alert kind="warning">
            Visit your sector&apos;s election office with your National ID card to correct your registration. Don&apos;t vote with details that aren&apos;t yours.
          </Alert>
          <button className="btn-secondary" onClick={() => setStage("identify")}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Start again
          </button>
        </div>
      )}

      {(stage === "face" || stage === "submitting") && profile && (
        <div className="space-y-4">
          <ProblemAlert problem={problem} />
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="card p-4">
              <FaceCamera
                onScan={onScan}
                onReady={() => setCameraReady(true)}
                paused={stage === "submitting"}
                intervalMs={40}
                withDescriptor={blinked}
                overlayText={stage === "submitting" ? "Verifying…" : blinked ? "✓ Live person confirmed. Hold still…" : undefined}
              />
            </div>
            <div className="card flex flex-col p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Verifying</p>
              <p className="text-lg font-bold">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="font-mono text-sm text-muted">{profile.nationalId}</p>

              <div className="mt-4">
                <Alert kind={blinked ? "success" : "info"}>
                  {stage === "submitting"
                    ? "Comparing your face with your registration…"
                    : blinked
                      ? `${livenessBy === "turn" ? "Head turn" : "Blink"} detected. Hold still for a moment…`
                      : !singleFace
                        ? "Centre your face in the oval, in good light, with nobody else in view."
                        : showTurnHint
                          ? headTurn.current.turned
                            ? "Good. Now look back at the camera."
                            : "Blink slowly once, or turn your head to one side and then back."
                          : "Now blink slowly once."}
                  {showTurnHint && !blinked && stage !== "submitting" && singleFace && (
                    <span className="mt-2 block">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-primary/20">
                        <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(turnProgress * 100)}%` }} />
                      </span>
                      <span className="mt-1 block text-xs opacity-80">
                        {headTurn.current.turned ? "Turn detected ✓, now back to the centre" : turnProgress > 0.3 ? "Keep turning…" : "Head turn"}
                      </span>
                    </span>
                  )}
                </Alert>
              </div>

              <ul className="mt-6 space-y-3">
                {[
                  { label: "Camera ready", done: cameraReady },
                  { label: "Face in view", done: faceSeen },
                  { label: "Only one person in frame", done: singleFace },
                  { label: showTurnHint ? "Live person (blink or head turn)" : "Blink detected (liveness)", done: blinked },
                  { label: "Face matched to registration", done: false, active: stage === "submitting" },
                ].map((c) => (
                  <li key={c.label} className="flex items-center gap-3 text-sm">
                    {c.done ? (
                      <CircleCheck className="h-5 w-5 text-success" aria-hidden />
                    ) : c.active ? (
                      <LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden />
                    ) : (
                      <Circle className="h-5 w-5 text-border-strong" aria-hidden />
                    )}
                    <span className={c.done ? "font-medium text-text" : "text-muted"}>{c.label}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                <button className="btn-secondary w-full" type="button" onClick={() => cancel("identify")} disabled={stage === "submitting"}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""} ${strong ? "text-base font-bold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
