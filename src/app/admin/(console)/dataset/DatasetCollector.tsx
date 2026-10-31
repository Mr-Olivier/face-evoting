"use client";

import { useRef, useState } from "react";
import { Camera, CircleCheck, CircleX, Images, LoaderCircle, ScanFace, Square } from "lucide-react";
import FaceCamera, { type CapturedFrame } from "@/components/FaceCamera";
import { Alert, Badge, Field, ProblemAlert } from "@/components/ui";
import type { ScanResult } from "@/lib/face-pipeline";
import { ApiError, callApi } from "@/lib/client-api";

type Kind = "face" | "background";
type Shot = { id: number; thumb: string; kind: Kind; status: "uploading" | "ok" | "failed"; category?: string; error?: string };

const BURST = 5;
const BURST_GAP_MS = 600;

/**
 * Collects training images for the Edge Impulse face detector.
 * Face shots carry the detected bounding boxes, so they arrive in Edge Impulse already labelled "face".
 */
export default function DatasetCollector() {
  const capture = useRef<(() => CapturedFrame | null) | null>(null);
  const latest = useRef<ScanResult | null>(null);
  const nextId = useRef(1);
  const [subjectCode, setSubjectCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [split, setSplit] = useState<"auto" | "training" | "testing">("training");
  const [faces, setFaces] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);

  const totals = {
    face: shots.filter((s) => s.kind === "face" && s.status === "ok").length,
    background: shots.filter((s) => s.kind === "background" && s.status === "ok").length,
    training: shots.filter((s) => s.status === "ok" && s.category === "training").length,
    testing: shots.filter((s) => s.status === "ok" && s.category === "testing").length,
    failed: shots.filter((s) => s.status === "failed").length,
  };

  async function shoot(kind: Kind): Promise<boolean> {
    const r = latest.current;
    const frame = capture.current?.();
    if (!r || !frame) return false;
    if (kind === "face" && r.boxes.length === 0) {
      setProblem({ message: "No face detected in this frame.", hint: "Wait for the green brackets around the face, then capture." });
      return false;
    }
    if (kind === "background" && r.boxes.length > 0) {
      setProblem({ message: "A face is visible, so this can't be a background image.", hint: "Point the camera at a scene with no people." });
      return false;
    }
    const id = nextId.current++;
    setShots((s) => [{ id, thumb: frame.dataUrl, kind, status: "uploading" as const }, ...s].slice(0, 24));
    try {
      const res = await callApi<{ category: string }>("/api/admin/dataset", {
        body: {
          kind,
          consent,
          split,
          subjectCode: subjectCode || undefined,
          images: [{ ...frame, boxes: kind === "face" ? r.boxes.map(({ x, y, width, height }) => ({ x, y, width, height })) : [] }],
        },
      });
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "ok", category: res.category } : x)));
      return true;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("ERROR", "Upload failed.", 0);
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "failed", error: err.message } : x)));
      setProblem({ message: err.message, hint: err.hint });
      return false;
    }
  }

  async function run(kind: Kind, count: number) {
    if (kind === "face" && !consent) {
      setProblem({ message: "Record consent first.", hint: "Tick the consent box once the person has signed the data-collection consent form." });
      return;
    }
    setProblem(null);
    setBusy(true);
    for (let i = 0; i < count; i++) {
      const ok = await shoot(kind);
      if (!ok) break;
      if (i < count - 1) await new Promise((r) => setTimeout(r, BURST_GAP_MS));
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <FaceCamera
          captureRef={capture}
          guide={false}
          withDescriptor={false}
          onScan={(r) => {
            latest.current = r;
            setFaces(r.boxes.length);
          }}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <button className="btn-primary" disabled={busy || faces === 0} onClick={() => run("face", 1)}>
            <ScanFace className="h-4 w-4" aria-hidden /> Capture face
          </button>
          <button className="btn-secondary" disabled={busy || faces === 0} onClick={() => run("face", BURST)}>
            <Images className="h-4 w-4" aria-hidden /> Burst ×{BURST}
          </button>
          <button className="btn-secondary" disabled={busy || faces > 0} onClick={() => run("background", 1)}>
            <Square className="h-4 w-4" aria-hidden /> Capture background
          </button>
        </div>
        <p className="text-xs text-subtle">
          Faces in view: <span className="font-semibold text-text">{faces}</span>. Every face in the frame is labelled. Between shots, change the angle, distance and lighting.
        </p>
      </div>

      <div className="space-y-5">
        <ProblemAlert problem={problem} />
        <div>
          <p className="label">Send images to</p>
          <div role="radiogroup" aria-label="Edge Impulse dataset" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
            {(
              [
                ["training", "Training"],
                ["testing", "Test"],
                ["auto", "Auto 80/20"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={split === value}
                onClick={() => setSplit(value)}
                className={`rounded-lg px-3 py-2 transition ${split === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            {split === "training"
              ? "The model learns from these images (Edge Impulse → Data acquisition → Training)."
              : split === "testing"
                ? "Kept aside to measure accuracy on images the model never saw (→ Test tab). Use different people from training if you can."
                : "Each capture goes to Training (80%) or Test (20%) at random."}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="subjectCode" label="Subject code" optional hint="Anonymous code from the consent form, e.g. VOL-03. Never use names.">
            <input
              id="subjectCode"
              className="input font-mono uppercase"
              maxLength={20}
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value.replace(/[^A-Za-z0-9-]/g, "").toUpperCase())}
              placeholder="VOL-03"
            />
          </Field>
          <div className="flex items-end">
            <label className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-(--primary)" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <span className="font-medium">Consent form signed</span>
                <span className="block text-xs text-muted">Required for face images</span>
              </span>
            </label>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            ["Faces", totals.face],
            ["Background", totals.background],
            ["Training", totals.training],
            ["Testing", totals.testing],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-3">
              <dd className="text-xl font-bold tabular-nums">{v}</dd>
              <dt className="text-xs text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        {totals.failed > 0 && <Alert kind="warning">{totals.failed} upload(s) failed. See the red thumbnails.</Alert>}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">This session</p>
          {shots.length === 0 ? (
            <p className="text-sm text-muted">No images captured yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {shots.map((s) => (
                <div key={s.id} title={s.error ?? `${s.kind} → ${s.category ?? "…"}`} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${s.status === "failed" ? "border-danger" : s.status === "ok" ? "border-success" : "border-border"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb} alt="" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white">
                    {s.status === "uploading" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : s.status === "ok" ? <CircleCheck className="h-3 w-3" /> : <CircleX className="h-3 w-3" />}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="flex items-start gap-2 text-xs text-subtle">
          <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Images are sent to Edge Impulse only. FaceVote keeps no copy. Aim for roughly 80% Training and 20% Test overall.
        </p>
        <Badge tone="primary">Target: 150–300 faces from 3–10 people + 30–50 backgrounds</Badge>
      </div>
    </div>
  );
}
