"use client";

import { useRef, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import FaceCamera from "@/components/FaceCamera";
import { Badge } from "@/components/ui";
import { DETECTOR_LABELS, createBlinkDetector, type ScanResult } from "@/lib/face-pipeline";

/** Live model test: detector output, FPS, eye ratio, blinks and face-distance comparison. */
export default function ModelLab({ threshold }: { threshold: number }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [fps, setFps] = useState(0);
  const [blinks, setBlinks] = useState(0);
  const [found, setFound] = useState({ model: 0, fallback: 0 });
  const [reference, setReference] = useState<number[] | null>(null);
  const last = useRef(0);
  const blink = useRef(createBlinkDetector());

  function onScan(r: ScanResult) {
    const now = performance.now();
    if (last.current) setFps(Math.round(1000 / (now - last.current)));
    last.current = now;
    setResult(r);
    if (r.detector === "edge-impulse" && r.boxes.length) {
      setFound((f) => (r.foundBy === "edge-impulse" ? { ...f, model: f.model + 1 } : { ...f, fallback: f.fallback + 1 }));
    }
    if (r.status === "ok" && blink.current.push(r.ear)) {
      setBlinks((b) => b + 1);
      blink.current.reset();
    }
  }

  const distance =
    reference && result?.status === "ok" ? Math.sqrt(reference.reduce((s, v, i) => s + (v - result.descriptor[i]) ** 2, 0)) : null;

  const rows: [string, string][] = [
    ["Detector", result ? DETECTOR_LABELS[result.detector] : "…"],
    ["Status", result?.status ?? "…"],
    ["Faces in frame", String(result?.boxes.length ?? 0)],
    ["Confidence", result?.boxes[0] ? `${(result.boxes[0].score * 100).toFixed(1)}%` : "—"],
    ["Frames / sec", String(fps)],
    ["Eye aspect ratio", result?.status === "ok" ? result.ear.toFixed(3) : "—"],
    ["Head turn (yaw)", result?.status === "ok" ? `${result.yaw.toFixed(2)} ${result.yaw > 0.16 ? "← left" : result.yaw < -0.16 ? "right →" : "front"}` : "—"],
    ["Brightness", result ? `${Math.round(result.brightness)} / 255` : "—"],
    ["Blinks counted", String(blinks)],
    ...(result?.detector === "edge-impulse"
      ? ([
          ["Faces found by your model", String(found.model)],
          ["Faces found by safety net", String(found.fallback)],
        ] as [string, string][])
      : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <FaceCamera onScan={onScan} />
      <div className="space-y-5">
        <dl className="divide-y divide-border rounded-xl border border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">Face distance tester</p>
          <p className="text-xs text-muted">Set your face as the reference, then compare yourself and other people to choose FACE_MATCH_THRESHOLD.</p>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={result?.status !== "ok"} onClick={() => result?.status === "ok" && setReference(result.descriptor)}>
              <Crosshair className="h-4 w-4" aria-hidden /> Set reference
            </button>
            {reference && (
              <button className="btn-ghost" onClick={() => setReference(null)}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Clear
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums">{distance !== null ? distance.toFixed(3) : "—"}</span>
            {distance !== null && (
              <Badge tone={distance <= threshold ? "success" : "danger"} dot>
                {distance <= threshold ? `Same person (≤ ${threshold})` : `Different (> ${threshold})`}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
