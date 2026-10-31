"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, LoaderCircle, VideoOff } from "lucide-react";
import { DETECTOR_LABELS, friendlyModelError, loadEngine, scanFrame, SCAN_MESSAGES, type DetectorName, type ScanResult } from "@/lib/face-pipeline";

/** A JPEG snapshot of the raw (unmirrored) camera frame, in the same pixel space as ScanResult boxes. */
export type CapturedFrame = { dataUrl: string; width: number; height: number };

type Props = {
  /** Receives a function that snapshots the current frame. */
  captureRef?: React.RefObject<(() => CapturedFrame | null) | null>;
  /** Called after every analysed frame. */
  onScan?: (result: ScanResult) => void;
  /** Called once the models are loaded. */
  onReady?: (detector: DetectorName) => void;
  /** Pause analysis (camera stays on). */
  paused?: boolean;
  /** Milliseconds between frames. */
  intervalMs?: number;
  /** Text shown over the video, e.g. "Verifying…". */
  overlayText?: string;
  /** Show the oval face guide. */
  guide?: boolean;
  /** Custom layer drawn over the video (e.g. guided-capture coaching). */
  overlay?: React.ReactNode;
  /** Hide the built-in status bar at the bottom of the video. */
  hideStatus?: boolean;
  /** Draw detection brackets around faces (default true). */
  showBoxes?: boolean;
  /** Compute the 128-number face signature on each frame (default true). False = faster, landmarks only. */
  withDescriptor?: boolean;
  className?: string;
};

/**
 * Webcam view with a live face-detection overlay.
 * Runs the Edge Impulse → face-api pipeline on each frame.
 */
export default function FaceCamera({
  captureRef,
  onScan,
  onReady,
  paused = false,
  intervalMs = 120,
  overlayText,
  guide = true,
  overlay,
  hideStatus = false,
  showBoxes = true,
  withDescriptor = true,
  className = "",
}: Props) {
  const withDescriptorRef = useRef(withDescriptor);
  withDescriptorRef.current = withDescriptor;
  const showBoxesRef = useRef(showBoxes);
  showBoxesRef.current = showBoxes;
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const onReadyRef = useRef(onReady);
  const pausedRef = useRef(paused);
  onScanRef.current = onScan;
  onReadyRef.current = onReady;
  pausedRef.current = paused;

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [detector, setDetector] = useState<DetectorName | null>(null);
  const [message, setMessage] = useState("Starting camera…");
  const [status, setStatus] = useState<ScanResult["status"] | null>(null);
  const [foundBy, setFoundBy] = useState<DetectorName | null>(null);

  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d")!.drawImage(video, 0, 0);
      return { dataUrl: c.toDataURL("image/jpeg", 0.88), width: c.width, height: c.height };
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not available. Use a modern browser on http://localhost or HTTPS.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        setMessage("Loading face model…");
        const engine = await loadEngine();
        if (stopped) return;
        setDetector(engine.detector);
        onReadyRef.current?.(engine.detector);
        setPhase("ready");
        loop();
      } catch (e) {
        setPhase("error");
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the address bar and reload."
            : name === "NotReadableError"
              ? "The camera is being used by another app. Close it and reload."
              : name
                ? e instanceof Error
                  ? e.message
                  : "Could not start the camera."
                : friendlyModelError(e),
        );
      }
    }

    async function loop() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && !pausedRef.current && video.readyState >= 2) {
        try {
          const result = await scanFrame(video, { descriptor: withDescriptorRef.current });
          if (stopped) return;
          draw(result, video);
          setMessage(SCAN_MESSAGES[result.status]);
          setStatus(result.status);
          setFoundBy(result.boxes.length ? result.foundBy : null);
          onScanRef.current?.(result);
        } catch (e) {
          console.error(e);
        }
      }
      timer = setTimeout(loop, intervalMs);
    }

    function draw(result: ScanResult, video: HTMLVideoElement) {
      const canvas = overlayRef.current;
      if (!canvas) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!showBoxesRef.current) return;
      const color = result.status === "ok" ? "#22c55e" : "#f59e0b";
      for (const b of result.boxes) {
        // Corner brackets instead of a full rectangle
        const l = Math.min(b.width, b.height) * 0.22;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        const corners: [number, number, number, number][] = [
          [b.x, b.y, 1, 1],
          [b.x + b.width, b.y, -1, 1],
          [b.x, b.y + b.height, 1, -1],
          [b.x + b.width, b.y + b.height, -1, -1],
        ];
        for (const [x, y, dx, dy] of corners) {
          ctx.moveTo(x + dx * l, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * l);
        }
        ctx.stroke();
      }
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [intervalMs]);

  const tone =
    status === "ok" ? "bg-emerald-500/90" : status === null ? "bg-slate-900/70" : "bg-amber-500/90";

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-slate-950">
        {/* Mirrored so it feels like a mirror to the voter */}
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />

        {phase === "ready" && guide && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div
              className={`h-[72%] w-[44%] rounded-[50%] border-2 border-dashed transition-colors ${
                status === "ok" ? "border-emerald-400/80" : "border-white/45"
              }`}
            />
          </div>
        )}

        {phase === "ready" && !paused && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-scan h-1/2 w-full bg-gradient-to-b from-transparent via-sky-400/10 to-sky-400/25" />
          </div>
        )}

        {phase === "ready" && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            LIVE
          </div>
        )}

        {phase === "ready" && overlay}

        {phase === "ready" && !hideStatus && (
          <div className={`absolute inset-x-3 bottom-3 rounded-xl px-3 py-2 text-center text-sm font-medium text-white backdrop-blur ${overlayText ? "bg-sky-600/90" : tone}`}>
            {overlayText ?? message}
          </div>
        )}

        {phase !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
            {phase === "error" ? (
              <>
                <VideoOff className="h-8 w-8 text-red-300" aria-hidden />
                <span className="max-w-xs text-red-200">{error}</span>
              </>
            ) : (
              <>
                <LoaderCircle className="h-8 w-8 animate-spin text-sky-300" aria-hidden />
                <span className="text-slate-200">{message}</span>
              </>
            )}
          </div>
        )}
      </div>
      {detector && (
        <div className="flex items-center justify-between text-xs text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" aria-hidden />
            Detector: <span className="font-semibold text-muted">{DETECTOR_LABELS[detector]}</span>
            {detector === "edge-impulse" && foundBy && (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${foundBy === "edge-impulse" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                {foundBy === "edge-impulse" ? "face found by your model" : "safety net used"}
              </span>
            )}
          </span>
          <span>Processed on this device · no photos stored</span>
        </div>
      )}
    </div>
  );
}
