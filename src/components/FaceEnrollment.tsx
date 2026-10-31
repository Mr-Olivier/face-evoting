"use client";

/**
 * Guided face enrolment (registration desk).
 *
 *  Camera mode — three poses, captured automatically:
 *    1. look straight   2. turn slightly left   3. turn slightly right
 *  Each frame is checked (light, distance, centring, one face, eyes open, head angle,
 *  movement) and the most important problem is shown as a plain instruction. When the pose
 *  is right and steady for ~0.5 s the shot is taken by itself. If a pose takes too long, a
 *  manual "Capture anyway" button appears so registration never gets stuck.
 *
 *  Upload mode — 1–5 photos (phone gallery / scanned). Each photo is checked with a clear
 *  reason if it can't be used. With fewer than 3 usable photos, extra samples are derived
 *  (mirror + tight crop) so the server always receives at least 3.
 *
 * Works in any environment: no special background is needed and lighting checks only coach.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CircleCheck,
  ImageUp,
  LoaderCircle,
  RotateCcw,
  ScanFace,
  Sun,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import FaceCamera, { type CapturedFrame } from "./FaceCamera";
import { averageDescriptors, friendlyModelError, loadSsd, scanImage, warmUp, type ScanResult } from "@/lib/face-pipeline";

export type BoxLite = { x: number; y: number; width: number; height: number };
export type FaceSample = { descriptor: number[]; frame: CapturedFrame | null; boxes: BoxLite[]; label: string };

type Pose = "front" | "left" | "right";
const POSES: { id: Pose; title: string; instruction: string }[] = [
  { id: "front", title: "Look straight", instruction: "Look straight at the camera" },
  { id: "left", title: "Turn left", instruction: "Slowly turn your head a little to your left" },
  { id: "right", title: "Turn right", instruction: "Slowly turn your head a little to your right" },
];

const HOLD_FRAMES = 4; // ~0.5 s of steady, correct frames
const MANUAL_AFTER_MS = 8000;

type Tone = "info" | "warn" | "good";
type Guidance = { tone: Tone; text: string; tip?: string; arrow?: "left" | "right" };

/** Picks the single most useful instruction for this frame. `ok` = ready to capture this pose. */
function assess(r: ScanResult, pose: Pose, prevCenter: { x: number; y: number } | null): { ok: boolean; g: Guidance; center?: { x: number; y: number } } {
  const dark = r.brightness < 50;
  if (r.status === "no-face")
    return dark
      ? { ok: false, g: { tone: "warn", text: "It's too dark to see a face", tip: "Turn on a light or face a window. Avoid a bright light behind the person." } }
      : { ok: false, g: { tone: "info", text: "Move your face into the oval", tip: "Look at the camera from about an arm's length away." } };
  if (r.status === "multiple-faces")
    return { ok: false, g: { tone: "warn", text: "More than one face in view", tip: "Only the person registering should be in the frame." } };
  if (r.status === "face-not-clear")
    return dark
      ? { ok: false, g: { tone: "warn", text: "Too dark: the face isn't clear", tip: "Add light in front of the face." } }
      : { ok: false, g: { tone: "info", text: "Hold still: the face isn't clear yet", tip: "Move a little closer and keep the head steady." } };

  const { faceBox, frame } = r;
  const width = faceBox.width / frame.width;
  const center = { x: (faceBox.x + faceBox.width / 2) / frame.width, y: (faceBox.y + faceBox.height / 2) / frame.height };

  if (r.brightness < 50) return { ok: false, center, g: { tone: "warn", text: "Too dark", tip: "Turn on a light or face a window." } };
  if (r.brightness > 215) return { ok: false, center, g: { tone: "warn", text: "Too bright", tip: "Move away from direct sunlight or a strong lamp." } };
  if (width < 0.2) return { ok: false, center, g: { tone: "info", text: "Move a little closer" } };
  if (width > 0.62) return { ok: false, center, g: { tone: "info", text: "Move back a little" } };
  // Raw camera image: the person's left side is on the right. Tell them which way to move, from their point of view.
  if (center.x < 0.32) return { ok: false, center, g: { tone: "info", text: "Move a little to your left", arrow: "left" } };
  if (center.x > 0.68) return { ok: false, center, g: { tone: "info", text: "Move a little to your right", arrow: "right" } };
  if (center.y < 0.3) return { ok: false, center, g: { tone: "info", text: "Lower the camera or move down a little" } };
  if (center.y > 0.7) return { ok: false, center, g: { tone: "info", text: "Raise the camera or sit up a little" } };
  if (r.ear < 0.17) return { ok: false, center, g: { tone: "info", text: "Keep your eyes open" } };

  const y = r.yaw;
  if (pose === "front" && Math.abs(y) > 0.12)
    return { ok: false, center, g: { tone: "info", text: "Look straight at the camera", arrow: y > 0 ? "right" : "left" } };
  if (pose === "left") {
    if (y > 0.55) return { ok: false, center, g: { tone: "info", text: "A little less: turn back slightly", arrow: "right" } };
    if (y < 0.16) return { ok: false, center, g: { tone: "info", text: "Turn your head a little to your left", arrow: "left" } };
  }
  if (pose === "right") {
    if (y < -0.55) return { ok: false, center, g: { tone: "info", text: "A little less: turn back slightly", arrow: "left" } };
    if (y > -0.16) return { ok: false, center, g: { tone: "info", text: "Turn your head a little to your right", arrow: "right" } };
  }
  if (prevCenter && Math.hypot(center.x - prevCenter.x, center.y - prevCenter.y) > 0.035)
    return { ok: false, center, g: { tone: "info", text: "Hold still…" } };
  return { ok: true, center, g: { tone: "good", text: "Perfect. Hold still…" } };
}

export default function FaceEnrollment({ onChange, required = 3 }: { onChange: (samples: FaceSample[]) => void; required?: number }) {
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  // Start loading the face models right away, while the officer is still typing the form.
  useEffect(() => {
    warmUp().catch(() => {});
  }, []);
  const [samples, setSamples] = useState<FaceSample[]>([]);
  const update = useCallback(
    (next: FaceSample[]) => {
      setSamples(next);
      onChange(next);
    },
    [onChange],
  );

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Capture method" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
        {(
          [
            ["camera", "Use camera", Camera],
            ["upload", "Upload photos", Upload],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id);
              update([]);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 transition ${mode === id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {mode === "camera" ? (
        <GuidedCamera samples={samples} onSamples={update} onUseUpload={() => setMode("upload")} />
      ) : (
        <PhotoUpload required={required} onSamples={update} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- camera

function GuidedCamera({ samples, onSamples, onUseUpload }: { samples: FaceSample[]; onSamples: (s: FaceSample[]) => void; onUseUpload: () => void }) {
  const capture = useRef<(() => CapturedFrame | null) | null>(null);
  const held = useRef<number[][]>([]);
  const prevCenter = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef<ScanResult | null>(null);
  const busy = useRef(false);
  const [step, setStep] = useState(0);
  const [guidance, setGuidance] = useState<Guidance>({ tone: "info", text: "Starting camera…" });
  const [hold, setHold] = useState(0);
  const [flash, setFlash] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const [stepStarted, setStepStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [cameraFailed, setCameraFailed] = useState(false);

  const done = step >= POSES.length;
  const pose = POSES[Math.min(step, POSES.length - 1)];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // If the camera never becomes ready, suggest uploading.
  useEffect(() => {
    const t = setTimeout(() => !latest.current && setCameraFailed(true), 15000);
    return () => clearTimeout(t);
  }, []);

  const take = useCallback(
    (descriptor: number[], r: ScanResult & { status: "ok" }) => {
      busy.current = true;
      const frame = capture.current?.() ?? null;
      const sample: FaceSample = { descriptor, frame, boxes: [r.faceBox], label: POSES[step].title };
      const next = [...samples.filter((s) => s.label !== sample.label), sample];
      setFlash(true);
      setJustCaptured(true);
      setTimeout(() => setFlash(false), 180);
      setTimeout(() => {
        setJustCaptured(false);
        held.current = [];
        setHold(0);
        // Go to the first pose that still has no sample.
        const nextStep = POSES.findIndex((p) => !next.some((s) => s.label === p.title));
        setStep(nextStep === -1 ? POSES.length : nextStep);
        setStepStarted(Date.now());
        busy.current = false;
      }, 750);
      onSamples(next);
    },
    [samples, step, onSamples],
  );

  const onScan = useCallback(
    (r: ScanResult) => {
      latest.current = r;
      setCameraFailed(false);
      if (done || busy.current) return;
      const { ok, g, center } = assess(r, pose.id, prevCenter.current);
      prevCenter.current = center ?? null;
      setGuidance(g);
      if (ok && r.status === "ok") {
        held.current.push(r.descriptor);
        setHold(held.current.length);
        if (held.current.length >= HOLD_FRAMES) take(averageDescriptors(held.current), r);
      } else if (held.current.length) {
        held.current = [];
        setHold(0);
      }
    },
    [done, pose.id, take],
  );

  function manualCapture() {
    const r = latest.current;
    if (r?.status !== "ok") {
      setGuidance({ tone: "warn", text: "No clear face to capture yet", tip: "Make sure one face is visible and well lit." });
      return;
    }
    take(r.descriptor, r);
  }

  function retake(label: string) {
    const next = samples.filter((s) => s.label !== label);
    onSamples(next);
    setStep(POSES.findIndex((p) => p.title === label));
    setStepStarted(Date.now());
    held.current = [];
    setHold(0);
  }

  const ringColor = guidance.tone === "good" ? "border-emerald-400" : guidance.tone === "warn" ? "border-amber-400" : "border-white/60";
  const progress = Math.min(1, hold / HOLD_FRAMES);
  const showManual = !done && !justCaptured && now - stepStarted > MANUAL_AFTER_MS;

  const overlay = (
    <div className="pointer-events-none absolute inset-0">
      {/* Oval guide */}
      <div className="absolute inset-0 grid place-items-center">
        <div className={`relative h-[74%] w-[46%] rounded-[50%] border-[3px] transition-colors duration-200 ${justCaptured ? "border-emerald-400" : ringColor}`}>
          {progress > 0 && !justCaptured && (
            <div className="absolute inset-0 rounded-[50%] border-[3px] border-emerald-400" style={{ clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` }} />
          )}
        </div>
      </div>
      {/* Direction arrow (screen is mirrored, so the person's left is on screen left) */}
      {guidance.arrow && !justCaptured && (
        <div className={`absolute top-1/2 -translate-y-1/2 ${guidance.arrow === "left" ? "left-3" : "right-3"}`}>
          <span className="grid h-12 w-12 animate-pulse place-items-center rounded-full bg-black/55 text-white backdrop-blur">
            {guidance.arrow === "left" ? <ArrowLeft className="h-6 w-6" /> : <ArrowRight className="h-6 w-6" />}
          </span>
        </div>
      )}
      {/* Step pill */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
        {done ? "All photos captured" : `Step ${step + 1} of ${POSES.length} · ${pose.title}`}
      </div>
      {/* Guidance bar */}
      {!done && (
        <div
          className={`absolute inset-x-3 bottom-3 rounded-xl px-3 py-2 text-center text-white backdrop-blur ${
            justCaptured ? "bg-emerald-600/90" : guidance.tone === "good" ? "bg-emerald-600/85" : guidance.tone === "warn" ? "bg-amber-600/90" : "bg-slate-900/75"
          }`}
          aria-live="polite"
        >
          <p className="text-sm font-semibold">{justCaptured ? "✓ Got it" : guidance.tone === "good" ? guidance.text : `${pose.instruction}`}</p>
          {!justCaptured && guidance.tone !== "good" && guidance.text !== pose.instruction && (
            <p className="text-xs opacity-90">
              {guidance.text}
              {guidance.tip ? ` · ${guidance.tip}` : ""}
            </p>
          )}
        </div>
      )}
      {flash && <div className="absolute inset-0 bg-white/80" />}
    </div>
  );

  return (
    <div className="space-y-4">
      <FaceCamera captureRef={capture} onScan={onScan} paused={done || justCaptured} guide={false} hideStatus showBoxes={false} overlay={overlay} />

      {/* Pose checklist / thumbnails */}
      <div className="grid grid-cols-3 gap-2">
        {POSES.map((p, i) => {
          const s = samples.find((x) => x.label === p.title);
          const active = i === step && !done;
          return (
            <div key={p.id} className={`overflow-hidden rounded-xl border ${s ? "border-success" : active ? "border-primary" : "border-border"}`}>
              <div className="relative aspect-[4/3] bg-surface-2">
                {s?.frame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.frame.dataUrl} alt={p.title} className="h-full w-full -scale-x-100 object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-subtle">
                    {p.id === "front" ? <ScanFace className="h-6 w-6" /> : p.id === "left" ? <ArrowLeft className="h-6 w-6" /> : <ArrowRight className="h-6 w-6" />}
                  </span>
                )}
                {s && (
                  <button
                    type="button"
                    onClick={() => retake(p.title)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    aria-label={`Retake ${p.title}`}
                    title="Retake"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium ${s ? "text-success" : active ? "text-primary" : "text-subtle"}`}>
                {s && <CircleCheck className="h-3.5 w-3.5" aria-hidden />}
                {p.title}
              </p>
            </div>
          );
        })}
      </div>

      {showManual && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm">
          <span className="text-muted">Having trouble with this pose?</span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={manualCapture}>
            <Camera className="h-3.5 w-3.5" aria-hidden /> Capture anyway
          </button>
        </div>
      )}
      {cameraFailed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" aria-hidden /> Camera not working?
          </span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onUseUpload}>
            <ImageUp className="h-3.5 w-3.5" aria-hidden /> Upload photos instead
          </button>
        </div>
      )}
      {done && (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CircleCheck className="h-4 w-4" aria-hidden /> Face captured from 3 angles. Tap a photo&apos;s ↻ to retake it.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- upload

type UploadItem = { id: number; name: string; thumb?: string; status: "checking" | "ok" | "error"; message?: string; pose?: string };

const MAX_FILES = 5;
const PHOTO_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
const MAX_BYTES = 10 * 1024 * 1024;

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode"));
      i.src = url;
    });
    const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight)); // high-res: faces are cropped from this
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function variant(src: HTMLCanvasElement, kind: "mirror" | "crop", box: BoxLite): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  if (kind === "mirror") {
    c.width = src.width;
    c.height = src.height;
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
  } else {
    const side = Math.min(Math.max(box.width, box.height) * 1.8, src.width, src.height);
    const x = Math.max(0, Math.min(src.width - side, box.x + box.width / 2 - side / 2));
    const y = Math.max(0, Math.min(src.height - side, box.y + box.height / 2 - side / 2));
    c.width = 416;
    c.height = 416;
    ctx.drawImage(src, x, y, side, side, 0, 0, 416, 416);
  }
  return c;
}

function resizedThumb(src: HTMLCanvasElement): string {
  const s = Math.min(1, 160 / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

const poseLabel = (yaw: number) => (yaw > 0.16 ? "Turned left" : yaw < -0.16 ? "Turned right" : "Front");

function PhotoUpload({ required, onSamples }: { required: number; onSamples: (s: FaceSample[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "warn" | "good"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    warmUp()
      .then(() => loadSsd())
      .catch(() => {});
  }, []);

  async function handle(files: File[]) {
    if (!files.length || working) return;
    setWorking(true);
    setNote(null);
    onSamples([]);
    const chosen = files.slice(0, MAX_FILES);
    const fresh: UploadItem[] = chosen.map((f) => ({ id: nextId.current++, name: f.name, status: "checking" }));
    setItems(fresh);
    const good: { canvas: HTMLCanvasElement; descriptor: number[]; box: BoxLite; label: string; preview: { canvas: HTMLCanvasElement; box: BoxLite } }[] = [];

    try {
      setStatus("Preparing the face checker\u2026");
      try {
        await withTimeout(warmUp(), 60_000);
      } catch (e) {
        setNote({ tone: "warn", text: friendlyModelError(e) });
        setItems((list) => list.map((x) => ({ ...x, status: "error", message: "Not checked: the face checker didn't start." })));
        return;
      }

      for (const [i, file] of chosen.entries()) {
        const id = fresh[i].id;
        setStatus(`Checking photo ${i + 1} of ${chosen.length}\u2026`);
        const fail = (message: string) => setItems((list) => list.map((x) => (x.id === id ? { ...x, status: "error", message } : x)));
        if (!file.type.startsWith("image/")) {
          fail("Not an image. Use a JPG or PNG photo.");
          continue;
        }
        if (file.size > MAX_BYTES) {
          fail("File is larger than 10 MB. Use a smaller photo.");
          continue;
        }
        let canvas: HTMLCanvasElement;
        try {
          canvas = await withTimeout(fileToCanvas(file), PHOTO_TIMEOUT_MS);
        } catch {
          fail("This photo can't be opened here (e.g. HEIC). Save it as JPG or PNG and try again.");
          continue;
        }
        const thumb = resizedThumb(canvas);
        setItems((list) => list.map((x) => (x.id === id ? { ...x, thumb } : x)));
        try {
          const r = await withTimeout(scanImage(canvas), PHOTO_TIMEOUT_MS);
          if (r.status === "ok") {
            const label = poseLabel(r.yaw);
            good.push({ canvas, descriptor: r.descriptor, box: r.box, label, preview: r.preview });
            const extra = r.faces > 1 ? ` · main face used (${r.faces} faces in photo)` : "";
            setItems((list) => list.map((x) => (x.id === id ? { ...x, status: "ok", pose: label + extra } : x)));
          } else {
            fail(
              r.status === "multiple-faces"
                ? `${r.faces} people in this photo. Use a photo of only this person, or crop it to their face first.`
                : r.status === "too-small"
                  ? `The face is too small in this photo (about ${r.faceWidth} px wide). Use a closer photo, or crop it to the face.`
                  : r.status === "not-clear"
                    ? "A face was found but it isn't clear enough (blurred, covered or turned too far). Try another photo."
                    : r.brightness < 45
                      ? "Too dark: no face found. Use a well-lit photo."
                      : "No face found. Use a photo where the face is clearly visible and looking towards the camera.",
            );
          }
        } catch (e) {
          fail(e instanceof Error && e.message === "timeout" ? "Checking took too long. Try a smaller or clearer photo." : "This photo couldn't be checked. Try another photo.");
        }
      }

      if (good.length === 0) {
        setNote({ tone: "warn", text: "None of the photos can be used. Check the reasons above and choose other photos, or use the camera." });
        return;
      }

      const samples: FaceSample[] = good.map((g) => ({
        descriptor: g.descriptor,
        frame: { dataUrl: g.preview.canvas.toDataURL("image/jpeg", 0.85), width: g.preview.canvas.width, height: g.preview.canvas.height },
        boxes: [g.preview.box],
        label: g.label,
      }));
      // Fewer than `required` usable photos: derive extra samples from the ones we have.
      if (samples.length < required) setStatus("Creating extra samples\u2026");
      for (const g of good) {
        for (const kind of ["mirror", "crop"] as const) {
          if (samples.length >= required) break;
          try {
            const r = await withTimeout(scanImage(variant(g.canvas, kind, g.box)), PHOTO_TIMEOUT_MS);
            if (r.status === "ok") samples.push({ descriptor: r.descriptor, frame: null, boxes: [r.box], label: `${g.label} (${kind})` });
          } catch {
            /* skip this variant */
          }
        }
      }

      if (samples.length < required) {
        setNote({ tone: "warn", text: `Only ${samples.length} usable sample${samples.length === 1 ? "" : "s"}. Add another clear photo of the face.` });
        return;
      }
      setNote({
        tone: "good",
        text:
          (good.length >= required
            ? `${good.length} photos accepted.`
            : `${good.length} photo${good.length === 1 ? "" : "s"} accepted; extra samples were created automatically.`) +
          " Now press \u201cRegister voter\u201d to finish.",
      });
      onSamples(samples);
    } finally {
      setStatus("");
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-2"
        }`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface text-primary shadow-sm">
          <ImageUp className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">Drop 1–5 photos here</p>
          <p className="text-sm text-muted">Best: one facing the camera, one turned slightly left, one slightly right.</p>
        </div>
        <button type="button" className="btn-primary" disabled={working} onClick={() => input.current?.click()}>
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {working ? status || "Checking photos…" : items.length ? "Choose different photos" : "Choose photos"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handle(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <li className="flex items-center gap-1">
          <Sun className="h-3.5 w-3.5" aria-hidden /> Good, even light on the face
        </li>
        <li>· Only one person in the photo</li>
        <li>· No sunglasses, mask or cap</li>
        <li>· Any background is fine</li>
      </ul>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.thumb && <img src={it.thumb} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.name}</p>
                <p className={`text-xs ${it.status === "error" ? "text-danger" : it.status === "ok" ? "text-success" : "text-muted"}`}>
                  {it.status === "checking" ? "Checking…" : it.status === "ok" ? `Face found · ${it.pose}` : it.message}
                </p>
              </div>
              {it.status === "checking" ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden />
              ) : it.status === "ok" ? (
                <CircleCheck className="h-5 w-5 text-success" aria-hidden />
              ) : (
                <X className="h-5 w-5 text-danger" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p className={`rounded-xl px-3 py-2 text-sm ${note.tone === "good" ? "bg-success-soft text-success" : note.tone === "warn" ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
