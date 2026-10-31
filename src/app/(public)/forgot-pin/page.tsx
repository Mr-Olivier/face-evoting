"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle, Mail, RotateCcw } from "lucide-react";
import { Field, ProblemAlert, Steps, fieldProps } from "@/components/ui";
import { ApiError, callApi } from "@/lib/client-api";
import { digitsOnly, formatNationalId, nationalIdProblem, weakPinProblem } from "@/lib/rwanda";

type Stage = "id" | "code" | "pin" | "done";
type Problem = { message: string; hint?: string } | null;

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

export default function ForgotPinPage() {
  const [stage, setStage] = useState<Stage>("id");
  const [nationalId, setNationalId] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [resendAfter, setResendAfter] = useState(0);
  const [expiresAfter, setExpiresAfter] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem>(null);
  const [loading, setLoading] = useState(false);

  const resendLeft = useCountdown(resendAfter);
  const expiresLeft = useCountdown(expiresAfter);

  const nid = digitsOnly(nationalId);
  const client = {
    nationalId: nationalIdProblem(nid) ?? undefined,
    code: /^\d{6}$/.test(code) ? undefined : "Enter the 6-digit code from the email.",
    pin: weakPinProblem(pin, { nationalId: nid }) ?? undefined,
    pinConfirm: pinConfirm === pin && pin ? undefined : "The two PINs don't match.",
  };
  const err = (k: keyof typeof client) => (touched[k] ? client[k] : undefined) || fieldErrors[k] || undefined;

  async function run<T>(fn: () => Promise<T>, onError?: (e: ApiError) => void) {
    setLoading(true);
    setProblem(null);
    setFieldErrors({});
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fieldErrors);
        setProblem({ message: e.message, hint: e.hint });
        onError?.(e);
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setTouched((t) => ({ ...t, nationalId: true }));
    if (client.nationalId) return;
    const r = await run(() => callApi<{ sentTo: string; expiresInSeconds: number; resendInSeconds: number }>("/api/voters/pin-reset/request", { body: { nationalId: nid } }), (e2) => {
      if (e2.code === "RESEND_TOO_SOON") setResendAfter(Number(e2.data.waitSeconds) || 60);
    });
    if (r) {
      setSentTo(r.sentTo);
      setResendAfter(r.resendInSeconds);
      setExpiresAfter(r.expiresInSeconds);
      setCode("");
      setStage("code");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setTouched((t) => ({ ...t, code: true }));
    if (client.code) return;
    const r = await run(() => callApi("/api/voters/pin-reset/verify", { body: { code } }), (e2) => {
      if (e2.code === "WRONG_CODE") setCode("");
      if (e2.code === "CODE_EXPIRED" || e2.code === "LOCKED") setStage("id");
    });
    if (r) setStage("pin");
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setTouched((t) => ({ ...t, pin: true, pinConfirm: true }));
    if (client.pin || client.pinConfirm) return;
    const r = await run(() => callApi("/api/voters/pin-reset/complete", { body: { pin, pinConfirm } }), (e2) => {
      if (e2.code === "CODE_EXPIRED") setStage("id");
    });
    if (r) setStage("done");
  }

  const stepIndex = { id: 0, code: 1, pin: 2, done: 3 }[stage];
  const mm = Math.floor(expiresLeft / 60);
  const ss = String(expiresLeft % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reset your PIN</h1>
          <p className="mt-1 text-muted">We&apos;ll email a one-time code to the address you gave at registration.</p>
        </div>
        <Steps current={stepIndex} steps={["National ID", "Email code", "New PIN"]} />
      </div>

      <ProblemAlert problem={problem} />

      {stage === "id" && (
        <form onSubmit={requestCode} noValidate className="card space-y-5 p-6 sm:p-8">
          <Field id="nationalId" label="National ID number" error={err("nationalId")} hint="16 digits, as printed on your ID card.">
            <input
              {...fieldProps("nationalId", err("nationalId"))}
              className={`${fieldProps("nationalId", err("nationalId")).className} font-mono tracking-wider`}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="1 •••• • ••••••• • ••"
              value={formatNationalId(nationalId)}
              onChange={(e) => setNationalId(digitsOnly(e.target.value).slice(0, 16))}
              onBlur={() => setTouched((t) => ({ ...t, nationalId: true }))}
            />
          </Field>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            {loading ? "Sending…" : "Email me a code"}
          </button>
          <p className="text-xs text-subtle">No email on your registration? Visit your sector&apos;s election office with your ID card to reset your PIN in person.</p>
        </form>
      )}

      {stage === "code" && (
        <form onSubmit={verifyCode} noValidate className="card space-y-5 p-6 sm:p-8">
          <div className="flex items-start gap-3 rounded-xl bg-primary-soft p-4 text-sm text-primary">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              We sent a 6-digit code to <span className="font-semibold">{sentTo}</span>.
              {expiresLeft > 0 ? ` It expires in ${mm}:${ss}.` : " It has expired. Ask for a new one."}
            </p>
          </div>
          <Field id="code" label="Code from the email" error={err("code")} hint="Check your spam folder if you don't see it.">
            <input
              {...fieldProps("code", err("code"))}
              className={`${fieldProps("code", err("code")).className} text-center font-mono text-2xl tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(digitsOnly(e.target.value).slice(0, 6))}
              onBlur={() => setTouched((t) => ({ ...t, code: true }))}
            />
          </Field>
          <button className="btn-primary w-full" disabled={loading || expiresLeft === 0}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {loading ? "Checking…" : "Verify code"}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="btn-ghost px-2 py-1" onClick={() => setStage("id")}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Change ID
            </button>
            <button type="button" className="btn-ghost px-2 py-1" disabled={resendLeft > 0 || loading} onClick={() => requestCode()}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {resendLeft > 0 ? `Resend in ${resendLeft}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {stage === "pin" && (
        <form onSubmit={savePin} noValidate className="card space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-success-soft text-success">
              <CircleCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Code verified</h2>
              <p className="text-sm text-muted">Choose a new 6-digit PIN you&apos;ll remember.</p>
            </div>
          </div>
          <Field id="pin" label="New PIN" error={err("pin")} hint="No repeated digits, sequences, birth dates or digits from your ID or phone.">
            <div className="relative">
              <input
                {...fieldProps("pin", err("pin"))}
                className={`${fieldProps("pin", err("pin")).className} pr-11 font-mono tracking-[0.4em]`}
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                autoFocus
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(digitsOnly(e.target.value).slice(0, 6))}
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
          <Field id="pinConfirm" label="Confirm new PIN" error={err("pinConfirm")}>
            <input
              {...fieldProps("pinConfirm", err("pinConfirm"))}
              className={`${fieldProps("pinConfirm", err("pinConfirm")).className} font-mono tracking-[0.4em]`}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(digitsOnly(e.target.value).slice(0, 6))}
              onBlur={() => setTouched((t) => ({ ...t, pinConfirm: true }))}
            />
          </Field>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            {loading ? "Saving…" : "Save new PIN"}
          </button>
        </form>
      )}

      {stage === "done" && (
        <div className="card space-y-5 p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
            <CircleCheck className="h-8 w-8" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-bold">Your PIN has been changed</h2>
            <p className="mt-1 text-sm text-muted">We&apos;ve emailed you a security notice. Use your National ID and new PIN to vote.</p>
          </div>
          <Link href="/verify" className="btn-primary">
            Continue to vote <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}

      {stage !== "done" && (
        <p className="text-center text-sm">
          <Link href="/verify" className="text-primary hover:underline">
            Remembered it? Back to voting
          </Link>
        </p>
      )}
    </div>
  );
}
