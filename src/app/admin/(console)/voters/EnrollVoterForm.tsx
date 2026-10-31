"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleCheck, IdCard, LoaderCircle, Lock, Mail, MapPin, RotateCcw, ShieldCheck, UserCheck, UserPlus } from "lucide-react";
import FaceEnrollment, { type FaceSample } from "@/components/FaceEnrollment";
import { Alert, Badge, Field, ProblemAlert, fieldProps } from "@/components/ui";
import { ApiError, callApi } from "@/lib/client-api";
import { PROVINCES, PROVINCE_NAMES, digitsOnly, formatNationalId, parseNationalId, type Province } from "@/lib/rwanda";
import { registerVoterDetailsSchema, toFieldErrors } from "@/lib/validation";

const REQUIRED_SAMPLES = 3;

type Form = {
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "" | "MALE" | "FEMALE";
  phone: string;
  email: string;
  province: "" | Province;
  district: string;
  sector: string;
  cell: string;
  village: string;
  pin: string;
  pinConfirm: string;
  consentBiometric: boolean;
};

const EMPTY: Form = {
  nationalId: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "",
  phone: "",
  email: "",
  province: "",
  district: "",
  sector: "",
  cell: "",
  village: "",
  pin: "",
  pinConfirm: "",
  consentBiometric: false,
};

type Sample = FaceSample;
type EmailResult = { to: string; status: "SENT" | "FAILED" | "SKIPPED"; error?: string };
type DatasetResult = { ok: boolean; text: string };
type Done = { voterId: string; voterNumber: string; fullName: string; email: EmailResult | null; dataset?: DatasetResult };

export default function EnrollVoterForm({ edgeImpulseConnected }: { edgeImpulseConnected: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [samples, setSamples] = useState<Sample[]>([]);
  const [contribute, setContribute] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);
  const [faceKey, setFaceKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [retrying, setRetrying] = useState<null | "email" | "dataset">(null);
  const [duplicate, setDuplicate] = useState<{ voterNumber: string; name: string; distance: number; confirming: boolean } | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);

  // Client-side validation with the SAME schema the server uses.
  const clientErrors = useMemo(() => {
    const r = registerVoterDetailsSchema.safeParse({ ...form, sex: form.sex || undefined, province: form.province || undefined });
    return r.success ? {} : toFieldErrors(r.error);
  }, [form]);
  const err = (k: keyof Form) => (touched[k] ? clientErrors[k] : undefined) || serverErrors[k] || undefined;

  const nid = parseNationalId(form.nationalId);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "province") next.district = "";
      // Pre-fill sex from the ID number when it becomes valid.
      if (key === "nationalId") {
        const info = parseNationalId(String(value));
        if (info && !f.sex) next.sex = info.sex;
      }
      return next;
    });
    setServerErrors((e) => ({ ...e, [key]: "" }));
  }
  const touch = (k: keyof Form) => () => setTouched((t) => ({ ...t, [k]: true }));

  async function submit(e?: React.FormEvent, confirmDifferentPerson = false) {
    e?.preventDefault();
    setProblem(null);
    if (!confirmDifferentPerson) setDuplicate(null);
    setTouched(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true])));
    const invalid = Object.keys(clientErrors).length;
    if (invalid) {
      setProblem({ message: `Please correct the ${invalid} highlighted field${invalid === 1 ? "" : "s"}.`, hint: "Each field shows what needs to change." });
      const first = document.getElementById(Object.keys(clientErrors)[0]);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus({ preventScroll: true });
      return;
    }
    if (samples.length < REQUIRED_SAMPLES) {
      setProblem({ message: `Capture ${REQUIRED_SAMPLES - samples.length} more face sample${REQUIRED_SAMPLES - samples.length === 1 ? "" : "s"}.`, hint: "Follow the guided camera on the right (front, left, right), or upload photos." });
      return;
    }
    setSaving(true);
    try {
      const data = await callApi<{ voter: { id: string; voterNumber: string; fullName: string }; email: EmailResult | null }>("/api/admin/voters", {
        body: { ...form, samples: samples.map((s) => s.descriptor), confirmDifferentPerson },
      });
      setDuplicate(null);
      const dataset = contribute && edgeImpulseConnected ? await uploadDataset(data.voter.voterNumber) : undefined;
      setDone({ voterId: data.voter.id, voterNumber: data.voter.voterNumber, fullName: data.voter.fullName, email: data.email, dataset });
      router.refresh();
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setServerErrors(e2.fieldErrors);
        if (e2.code === "DUPLICATE_FACE") {
          // Keep the photos: the officer may confirm it's a different person.
          const m = e2.data.match as { voterNumber: string; name: string } | undefined;
          setDuplicate({ voterNumber: m?.voterNumber ?? "?", name: m?.name ?? "another voter", distance: Number(e2.data.distance) || 0, confirming: false });
        } else {
          setProblem({ message: e2.message, hint: e2.hint });
        }
        if (e2.code === "INCONSISTENT_SAMPLES") {
          setSamples([]);
          setFaceKey((k) => k + 1);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadDataset(voterNumber: string): Promise<DatasetResult> {
    const images = samples.filter((s) => s.frame).map((s) => ({ ...s.frame!, boxes: s.boxes }));
    if (images.length === 0) return { ok: false, text: "No photos to share with Edge Impulse." };
    try {
      const r = await callApi<{ uploaded: number; category: string }>("/api/admin/dataset", {
        body: { kind: "face", split: "training", consent: true, subjectCode: voterNumber, images },
      });
      return { ok: true, text: `${r.uploaded} image${r.uploaded === 1 ? "" : "s"} added to Edge Impulse → Data acquisition → ${r.category === "training" ? "Training" : "Test"} tab.` };
    } catch (e) {
      return { ok: false, text: `The Edge Impulse upload failed: ${e instanceof ApiError ? e.message : "unknown error"}` };
    }
  }

  async function resendEmail() {
    if (!done) return;
    setRetrying("email");
    try {
      const r = await callApi<{ to: string }>(`/api/admin/voters/${done.voterId}/email`, { body: { kind: "registration" } });
      setDone({ ...done, email: { to: r.to, status: "SENT" } });
    } catch (e) {
      setDone({ ...done, email: { to: done.email?.to ?? "", status: "FAILED", error: e instanceof ApiError ? e.message : "Unknown error" } });
    } finally {
      setRetrying(null);
    }
  }

  async function retryDataset() {
    if (!done) return;
    setRetrying("dataset");
    const dataset = await uploadDataset(done.voterNumber);
    setDone({ ...done, dataset });
    setRetrying(null);
  }

  useEffect(() => {
    if (duplicate && !duplicate.confirming) document.getElementById("duplicate-alert")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [duplicate]);

  // After a clean success, get ready for the next voter automatically.
  const allGood = Boolean(done && (!done.email || done.email.status === "SENT") && (!done.dataset || done.dataset.ok));
  useEffect(() => {
    if (!done || !allGood) {
      setNextIn(null);
      return;
    }
    setNextIn(3);
    const t = setInterval(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearInterval(t);
  }, [done, allGood]);
  useEffect(() => {
    if (nextIn === 0) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIn]);

  function reset() {
    setForm(EMPTY);
    setTouched({});
    setServerErrors({});
    setSamples([]);
    setContribute(false);
    setProblem(null);
    setFaceKey((k) => k + 1);
    setDone(null);
    setDuplicate(null);
    setNextIn(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => document.getElementById("nationalId")?.focus({ preventScroll: true }), 300);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheck className="h-8 w-8" aria-hidden />
        </span>
        <div>
          <h3 className="text-xl font-bold">{done.fullName} is registered</h3>
          <p className="mt-1 text-muted">
            Voter number <span className="font-mono font-semibold text-text">{done.voterNumber}</span>
          </p>
        </div>
        <div className="space-y-2 text-left">
          {done.email ? (
            done.email.status === "SENT" ? (
              <Alert kind="success">Registration details emailed to {done.email.to}.</Alert>
            ) : (
              <Alert kind="warning">
                <p className="font-semibold">
                  {done.email.status === "SKIPPED" ? `No email sent to ${done.email.to}: email isn't set up yet (see Integrations).` : `The email to ${done.email.to} didn't go through.`}
                </p>
                {done.email.error && done.email.status === "FAILED" && <p className="mt-0.5 opacity-90">{done.email.error}</p>}
                {done.email.status === "FAILED" && (
                  <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={resendEmail} disabled={retrying !== null}>
                    {retrying === "email" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                    {retrying === "email" ? "Sending…" : "Resend email"}
                  </button>
                )}
              </Alert>
            )
          ) : (
            <Alert kind="info">No email address on file, so no email was sent.</Alert>
          )}
          {done.dataset &&
            (done.dataset.ok ? (
              <Alert kind="success">{done.dataset.text}</Alert>
            ) : (
              <Alert kind="warning">
                <p>{done.dataset.text}</p>
                <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={retryDataset} disabled={retrying !== null}>
                  {retrying === "dataset" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                  {retrying === "dataset" ? "Uploading…" : "Retry upload"}
                </button>
              </Alert>
            ))}
        </div>
        <button className="btn-primary" onClick={reset}>
          <UserPlus className="h-4 w-4" aria-hidden /> {nextIn !== null && nextIn > 0 ? `Next voter in ${nextIn}s…` : "Register another voter"}
        </button>
        {nextIn !== null && nextIn > 0 && (
          <p>
            <button type="button" className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => setNextIn(null)}>
              Stay on this screen
            </button>
          </p>
        )}
      </div>
    );
  }

  const districts = form.province ? (PROVINCES[form.province] as readonly string[]) : [];
  const enough = samples.length >= REQUIRED_SAMPLES;

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 xl:grid-cols-[1fr_400px]">
      <div className="space-y-8">
        <ProblemAlert problem={problem} />
        {duplicate && (
          <div id="duplicate-alert" role="alert" className="space-y-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
            <p className="font-semibold">
              This face looks very similar to {duplicate.voterNumber} ({duplicate.name}).
            </p>
            <p className="opacity-90">
              Similarity distance <strong>{duplicate.distance.toFixed(2)}</strong> (lower means more alike). If this is the same person, don&apos;t register them twice. If
              it&apos;s a different person, compare both National ID cards, then confirm.
            </p>
            <div className="flex flex-wrap gap-2">
              {!duplicate.confirming ? (
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setDuplicate({ ...duplicate, confirming: true })}>
                  It&apos;s a different person
                </button>
              ) : (
                <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={saving} onClick={() => submit(undefined, true)}>
                  {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UserCheck className="h-3.5 w-3.5" aria-hidden />}
                  Confirm: register {form.firstName || "this person"} as a new voter
                </button>
              )}
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setDuplicate(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <Section Icon={IdCard} title="Identity" subtitle="Exactly as printed on the National ID card.">
          <Field
            id="nationalId"
            label="National ID number"
            error={err("nationalId")}
            hint={
              nid ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Valid ID structure · {nid.citizen ? "Citizen" : "Non-citizen"} · born {nid.birthYear} ·{" "}
                  {nid.sex === "MALE" ? "male" : "female"}
                </span>
              ) : (
                "16 digits. The year of birth and sex are checked against the number."
              )
            }
            className="sm:col-span-2"
          >
            <input
              {...fieldProps("nationalId", err("nationalId"))}
              className={`${fieldProps("nationalId", err("nationalId")).className} font-mono tracking-wider`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="1 1990 8 0012345 0 12"
              value={formatNationalId(form.nationalId)}
              onChange={(e) => set("nationalId", digitsOnly(e.target.value).slice(0, 16))}
              onBlur={touch("nationalId")}
            />
          </Field>
          <Field id="firstName" label="First name" error={err("firstName")}>
            <input {...fieldProps("firstName", err("firstName"))} autoComplete="off" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} onBlur={touch("firstName")} />
          </Field>
          <Field id="lastName" label="Last name (surname)" error={err("lastName")}>
            <input {...fieldProps("lastName", err("lastName"))} autoComplete="off" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} onBlur={touch("lastName")} />
          </Field>
          <Field id="dateOfBirth" label="Date of birth" error={err("dateOfBirth")} hint="Must match the year in the ID number. Voters must be 18 or older.">
            <input
              {...fieldProps("dateOfBirth", err("dateOfBirth"))}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              onBlur={touch("dateOfBirth")}
            />
          </Field>
          <Field id="sex" label="Sex" error={err("sex")} hint={nid ? "Pre-filled from the ID number." : undefined}>
            <div id="sex" role="radiogroup" aria-invalid={err("sex") ? true : undefined} className="grid grid-cols-2 gap-2">
              {(["FEMALE", "MALE"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={form.sex === s}
                  onClick={() => {
                    set("sex", s);
                    touch("sex")();
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    form.sex === s ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted hover:border-border-strong"
                  }`}
                >
                  {s === "MALE" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section Icon={Mail} title="Contact" subtitle="Used for registration and vote confirmations.">
          <Field id="phone" label="Mobile number" error={err("phone")} hint="MTN 078/079 or Airtel 072/073, e.g. 078 123 4567.">
            <input {...fieldProps("phone", err("phone"))} type="tel" inputMode="tel" autoComplete="off" placeholder="078 123 4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={touch("phone")} />
          </Field>
          <Field
            id="email"
            label="Email"
            optional
            error={err("email")}
            hint={form.email ? "A registration email and a confirmation after voting will be sent here." : "Without an email the voter won't receive confirmations."}
          >
            <input {...fieldProps("email", err("email"))} type="email" autoComplete="off" placeholder="name@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={touch("email")} />
          </Field>
        </Section>

        <Section Icon={MapPin} title="Residence" subtitle="Administrative location where the voter is registered.">
          <Field id="province" label="Province" error={err("province")}>
            <select {...fieldProps("province", err("province"))} value={form.province} onChange={(e) => set("province", e.target.value as Province)} onBlur={touch("province")}>
              <option value="">Select province…</option>
              {PROVINCE_NAMES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field id="district" label="District" error={err("district")} hint={form.province ? undefined : "Select a province first."}>
            <select {...fieldProps("district", err("district"))} value={form.district} disabled={!form.province} onChange={(e) => set("district", e.target.value)} onBlur={touch("district")}>
              <option value="">Select district…</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sector" label="Sector" error={err("sector")}>
            <input {...fieldProps("sector", err("sector"))} autoComplete="off" value={form.sector} onChange={(e) => set("sector", e.target.value)} onBlur={touch("sector")} />
          </Field>
          <Field id="cell" label="Cell" error={err("cell")}>
            <input {...fieldProps("cell", err("cell"))} autoComplete="off" value={form.cell} onChange={(e) => set("cell", e.target.value)} onBlur={touch("cell")} />
          </Field>
          <Field id="village" label="Village (umudugudu)" error={err("village")} className="sm:col-span-2">
            <input {...fieldProps("village", err("village"))} autoComplete="off" value={form.village} onChange={(e) => set("village", e.target.value)} onBlur={touch("village")} />
          </Field>
        </Section>

        <Section Icon={Lock} title="Voter PIN" subtitle="The voter types it privately. Never write it down for them.">
          <Field id="pin" label="6-digit PIN" error={err("pin")} hint="No repeated digits, sequences, birth dates or digits from the ID or phone.">
            <input
              {...fieldProps("pin", err("pin"))}
              className={`${fieldProps("pin", err("pin")).className} font-mono tracking-[0.4em]`}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={form.pin}
              onChange={(e) => set("pin", digitsOnly(e.target.value).slice(0, 6))}
              onBlur={touch("pin")}
            />
          </Field>
          <Field id="pinConfirm" label="Confirm PIN" error={err("pinConfirm")}>
            <input
              {...fieldProps("pinConfirm", err("pinConfirm"))}
              className={`${fieldProps("pinConfirm", err("pinConfirm")).className} font-mono tracking-[0.4em]`}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={form.pinConfirm}
              onChange={(e) => set("pinConfirm", digitsOnly(e.target.value).slice(0, 6))}
              onBlur={touch("pinConfirm")}
            />
          </Field>
        </Section>

        <Section Icon={ShieldCheck} title="Consent" subtitle="Read these to the voter before capturing their face.">
          <div className="space-y-3 sm:col-span-2">
            <label className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${err("consentBiometric") ? "border-danger" : "border-border"}`}>
              <input
                id="consentBiometric"
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-(--primary)"
                checked={form.consentBiometric}
                onChange={(e) => {
                  set("consentBiometric", e.target.checked);
                  touch("consentBiometric")();
                }}
              />
              <span>
                <span className="font-medium">The voter consents to biometric verification.</span>
                <span className="block text-muted">
                  A numeric face signature (not a photo) is stored and used only to confirm their identity when voting. It is deleted on request or when the register is retired.
                </span>
                {err("consentBiometric") && <span className="mt-1 block text-xs font-medium text-danger">{err("consentBiometric")}</span>}
              </span>
            </label>
            <label className={`flex items-start gap-3 rounded-xl border border-border p-4 text-sm ${edgeImpulseConnected ? "" : "opacity-60"}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-(--primary)" checked={contribute} disabled={!edgeImpulseConnected} onChange={(e) => setContribute(e.target.checked)} />
              <span>
                <span className="font-medium">
                  The voter also agrees to share the captured images for model training <Badge>optional</Badge>
                </span>
                <span className="block text-muted">
                  {edgeImpulseConnected
                    ? "The sample photos are sent to the project's Edge Impulse dataset, labelled \"face\", to improve the face detector. They are not linked to the voter's identity."
                    : "Connect Edge Impulse on the Integrations page to enable this."}
                </span>
              </span>
            </label>
          </div>
        </Section>
      </div>

      {/* Face panel */}
      <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
        <div className="card space-y-4 p-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <Camera className="h-4 w-4 text-primary" aria-hidden /> Face photos
            </h3>
            <Badge tone={enough ? "success" : "neutral"}>{enough ? "Ready" : `${Math.min(samples.length, REQUIRED_SAMPLES)} / ${REQUIRED_SAMPLES}`}</Badge>
          </div>
          <FaceEnrollment key={faceKey} required={REQUIRED_SAMPLES} onChange={setSamples} />
        </div>
        <button className="btn-primary btn-lg w-full" disabled={saving}>
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
          {saving ? "Registering…" : "Register voter"}
        </button>
        {duplicate ? (
          <p className="text-center text-xs font-medium text-warning">Possible duplicate: see the message at the top of the form.</p>
        ) : problem ? (
          <ProblemAlert problem={problem} />
        ) : (
          <p className="text-center text-xs text-subtle">Duplicate National IDs and duplicate faces are rejected automatically.</p>
        )}
      </div>
    </form>
  );
}

function Section({ Icon, title, subtitle, children }: { Icon: typeof IdCard; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{subtitle}</span>
        </span>
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
