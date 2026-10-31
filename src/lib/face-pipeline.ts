/**
 * Client-side face pipeline:
 *
 *   webcam frame
 *     → [1] DETECT   Edge Impulse object-detection model
 *                    (demo stand-in until you export yours; face-api fallback if disabled)
 *     → [2] CROP     region around the detected face
 *     → [3] EMBED    face-api: 68 landmarks + 128-number face descriptor
 *     → [4] LIVENESS eye-aspect-ratio from landmarks (blink detection)
 *
 * The descriptor is sent to the server, which decides whether it matches.
 * CLIENT-SIDE ONLY.
 */
import type * as FaceApi from "@vladmandic/face-api";
import { classify, getInputSize, getProperties, imageDataToFeatures, loadEdgeImpulse, type EIBox } from "./edge-impulse";
import { createDemoModel, type DemoModel } from "./demo-model";

type FaceApiModule = typeof FaceApi;

const MODELS_URL = process.env.NEXT_PUBLIC_FACE_MODELS_URL || "/models/face-api";
const USE_EDGE_IMPULSE = process.env.NEXT_PUBLIC_USE_EDGE_IMPULSE !== "false";
const USE_DEMO_MODEL = process.env.NEXT_PUBLIC_DEMO_MODEL !== "false";
const EI_MIN_CONFIDENCE = Number(process.env.NEXT_PUBLIC_EDGE_IMPULSE_MIN_CONFIDENCE ?? "0.6");
/**
 * Safety net for an early (under-trained) Edge Impulse model: when it finds no face in a frame,
 * use face-api's detector for that frame so registration/voting keep working. Each result says
 * which detector actually found the face (`foundBy`). Set to "false" once your model is good.
 */
const EI_FALLBACK = process.env.NEXT_PUBLIC_EDGE_IMPULSE_FALLBACK !== "false";

/** "edge-impulse" = your exported WASM model · "demo" = demo stand-in · "face-api" = plain fallback */
export type DetectorName = "edge-impulse" | "demo" | "face-api";
export type Box = { x: number; y: number; width: number; height: number; score: number };

export const DETECTOR_LABELS: Record<DetectorName, string> = {
  "edge-impulse": "Edge Impulse",
  demo: "Edge Impulse · demo model",
  "face-api": "face-api (fallback)",
};

/** Measurements shared by every scan, used for live guidance. */
type FrameInfo = {
  detector: DetectorName;
  boxes: Box[];
  /** Video size in pixels (boxes use the same space). */
  frame: { width: number; height: number };
  /** Mean brightness 0–255 of the face (or the whole frame when no single face). */
  brightness: number;
  /** Which detector found the face(s) in this frame (differs from `detector` when the safety net was used). */
  foundBy: DetectorName;
};

export type ScanResult =
  | ({ status: "no-face" } & FrameInfo)
  | ({ status: "multiple-faces" } & FrameInfo)
  | ({ status: "face-not-clear" } & FrameInfo)
  | ({
      status: "ok";
      descriptor: number[];
      ear: number;
      /** Head turn: 0 = facing the camera, > 0 = turned to the person's LEFT, < 0 = to their RIGHT. */
      yaw: number;
      /** Tight face box from the landmarks, in video pixels (better than FOMO centroid boxes). */
      faceBox: Omit<Box, "score">;
    } & FrameInfo);

type Engine = { faceapi: FaceApiModule; ei: unknown | null; demo: DemoModel | null; detector: DetectorName };
let enginePromise: Promise<Engine> | null = null;

/** Turns low-level model-loading errors into an instruction a person can act on. */
export function friendlyModelError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/values but has 0|tensor should have|Failed to fetch|NetworkError|404|load model/i.test(msg))
    return "The face model files didn't load correctly. Reload the page. If it keeps happening, turn off download-manager browser extensions (e.g. IDM) for this site.";
  if (/webgl|backend/i.test(msg)) return "This browser couldn't start the face checker (graphics problem). Try Chrome or Edge, or restart the browser.";
  return msg;
}

export function loadEngine(): Promise<Engine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const faceapi = (await import("@vladmandic/face-api")) as FaceApiModule;
    // `ready` exists at runtime but is missing from face-api's bundled tf typings
    await (faceapi.tf as unknown as { ready: () => Promise<void> }).ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    const ei = USE_EDGE_IMPULSE ? await loadEdgeImpulse() : null;
    if (ei) return { faceapi, ei, demo: null, detector: "edge-impulse" as const };
    if (USE_EDGE_IMPULSE && USE_DEMO_MODEL) return { faceapi, ei: null, demo: createDemoModel(faceapi), detector: "demo" as const };
    return { faceapi, ei: null, demo: null, detector: "face-api" as const };
  })();
  enginePromise.catch(() => (enginePromise = null));
  return enginePromise;
}

// Reusable canvases
let eiCanvas: HTMLCanvasElement | null = null;
let cropCanvas: HTMLCanvasElement | null = null;
let lastCrop = { x: 0, y: 0, side: 320 };
const canvas = (c: HTMLCanvasElement | null) => c ?? document.createElement("canvas");

/** Shared post-processing for Edge Impulse-style output: filter, scale to video pixels, merge FOMO boxes. */
function fromModelSpace(results: EIBox[], inputW: number, inputH: number, video: HTMLVideoElement): Box[] {
  const sx = video.videoWidth / inputW;
  const sy = video.videoHeight / inputH;
  const boxes = results
    .filter((r) => r.label.toLowerCase().includes("face") && r.value >= EI_MIN_CONFIDENCE)
    .map((r) => ({ x: r.x * sx, y: r.y * sy, width: r.width * sx, height: r.height * sy, score: r.value }));
  return mergeNearbyBoxes(boxes, Math.min(video.videoWidth, video.videoHeight) * 0.2);
}

/** [1a] Edge Impulse detection (real WebAssembly export). */
function detectWithEdgeImpulse(ei: unknown, video: HTMLVideoElement): Box[] {
  const { width, height } = getInputSize(getProperties(ei));
  eiCanvas = canvas(eiCanvas);
  eiCanvas.width = width;
  eiCanvas.height = height;
  const ctx = eiCanvas.getContext("2d", { willReadFrequently: true })!;
  // "Squash" resize — matches Edge Impulse's default image resize mode.
  ctx.drawImage(video, 0, 0, width, height);
  const features = imageDataToFeatures(ctx.getImageData(0, 0, width, height));
  return fromModelSpace(classify(ei, features).results, width, height, video);
}

/** [1b] Demo model — same output contract as the Edge Impulse export. */
async function detectWithDemoModel(demo: DemoModel, video: HTMLVideoElement): Promise<Box[]> {
  const { width, height } = getInputSize(demo.properties);
  return fromModelSpace(await demo.detect(video), width, height, video);
}

/**
 * FOMO models output several small boxes for one face (one per grid cell).
 * Merge boxes whose centres are close so one face counts as one.
 */
function mergeNearbyBoxes(boxes: Box[], distance: number): Box[] {
  const merged: Box[] = [];
  for (const b of boxes.sort((a, z) => z.score - a.score)) {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const near = merged.find((m) => Math.hypot(m.x + m.width / 2 - cx, m.y + m.height / 2 - cy) < distance);
    if (near) {
      const x1 = Math.min(near.x, b.x), y1 = Math.min(near.y, b.y);
      const x2 = Math.max(near.x + near.width, b.x + b.width), y2 = Math.max(near.y + near.height, b.y + b.height);
      Object.assign(near, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    } else merged.push({ ...b });
  }
  return merged;
}

/** [1c] Plain face-api detection. */
async function detectWithFaceApi(faceapi: FaceApiModule, video: HTMLVideoElement): Promise<Box[]> {
  const dets = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }));
  return dets.map((d) => ({ x: d.box.x, y: d.box.y, width: d.box.width, height: d.box.height, score: d.score }));
}

/** [2] Crop a generous square around the face (FOMO boxes mark the centre, not the full face). */
function cropAround(video: HTMLVideoElement, box: Box): HTMLCanvasElement {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const side = Math.min(Math.max(box.width, box.height, Math.min(vw, vh) * 0.35) * 1.8, Math.min(vw, vh));
  const x = Math.max(0, Math.min(vw - side, cx - side / 2));
  const y = Math.max(0, Math.min(vh - side, cy - side / 2));
  lastCrop = { x, y, side };
  cropCanvas = canvas(cropCanvas);
  cropCanvas.width = 320;
  cropCanvas.height = 320;
  cropCanvas.getContext("2d")!.drawImage(video, x, y, side, side, 0, 0, 320, 320);
  return cropCanvas;
}

/** Eye aspect ratio — drops sharply when the eyes close. */
function eyeAspectRatio(eye: { x: number; y: number }[]): number {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * d(eye[0], eye[3]));
}

let lumaCanvas: HTMLCanvasElement | null = null;
/** Mean luma (0–255) of a source, sampled on a tiny canvas so it costs almost nothing. */
function meanBrightness(source: CanvasImageSource): number {
  lumaCanvas = canvas(lumaCanvas);
  lumaCanvas.width = 32;
  lumaCanvas.height = 24;
  const ctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, 32, 24);
  const px = ctx.getImageData(0, 0, 32, 24).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return sum / (px.length / 4);
}

type Pt = { x: number; y: number };
/** Head-turn estimate from 68 landmarks: nose offset from the eye midpoint, relative to eye distance. */
function estimateYaw(points: Pt[]): number {
  const nose = points[30], a = points[36], b = points[45];
  const iod = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // In the raw (unmirrored) camera image the person's left side is on the right.
  return (nose.x - (a.x + b.x) / 2) / iod;
}

/** Runs the whole pipeline on the current video frame. */
/**
 * @param opts.descriptor  false = skip the 128-number face signature (the heaviest network).
 *   Use during liveness: landmarks alone give eye openness and head turn several times faster,
 *   so short blinks aren't missed. `descriptor` is then an empty array.
 */
export async function scanFrame(video: HTMLVideoElement, opts: { descriptor?: boolean } = {}): Promise<ScanResult> {
  const { faceapi, ei, demo, detector } = await loadEngine();
  const frame = { width: video.videoWidth, height: video.videoHeight };
  if (!video.videoWidth) return { status: "no-face", detector, foundBy: detector, boxes: [], frame, brightness: 0 };

  let foundBy: DetectorName = detector;
  let boxes = ei
    ? detectWithEdgeImpulse(ei, video)
    : demo
      ? await detectWithDemoModel(demo, video)
      : await detectWithFaceApi(faceapi, video);
  if (ei && boxes.length === 0 && EI_FALLBACK) {
    boxes = await detectWithFaceApi(faceapi, video);
    if (boxes.length) foundBy = "face-api";
  }
  if (boxes.length !== 1) {
    return { status: boxes.length === 0 ? "no-face" : "multiple-faces", detector, foundBy, boxes, frame, brightness: meanBrightness(video) };
  }

  const crop = cropAround(video, boxes[0]);
  const cropRect = lastCrop;
  const brightness = meanBrightness(crop);
  const withLandmarks = faceapi
    .detectSingleFace(crop, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
    .withFaceLandmarks();
  const result = opts.descriptor === false ? await withLandmarks : await withLandmarks.withFaceDescriptor();
  if (!result) return { status: "face-not-clear", detector, foundBy, boxes, frame, brightness };
  const descriptor = "descriptor" in result ? Array.from(result.descriptor as Float32Array) : [];

  const lm = result.landmarks;
  const ear = (eyeAspectRatio(lm.getLeftEye()) + eyeAspectRatio(lm.getRightEye())) / 2;
  const k = cropRect.side / 320;
  const xs = lm.positions.map((p) => p.x), ys = lm.positions.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const h = (maxY - minY) * 1.3; // landmarks start at the eyebrows; add the forehead
  const faceBox = { x: cropRect.x + minX * k, y: cropRect.y + (maxY - h) * k, width: (maxX - minX) * k, height: h * k };
  return { status: "ok", detector, foundBy, boxes, frame, brightness, descriptor, ear, yaw: estimateYaw(lm.positions), faceBox };
}

let warmPromise: Promise<void> | null = null;
/**
 * Loads the models and runs each network once on a blank image, so the first real photo
 * doesn't pay for model download + GPU shader compilation (often several seconds).
 */
export function warmUp(): Promise<void> {
  warmPromise ??= (async () => {
    const { faceapi } = await loadEngine();
    const blank = document.createElement("canvas");
    blank.width = 416;
    blank.height = 416;
    blank.getContext("2d")!.fillRect(0, 0, 416, 416);
    await faceapi.detectAllFaces(blank, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }));
    const face = document.createElement("canvas");
    face.width = 150;
    face.height = 150;
    face.getContext("2d")!.fillRect(0, 0, 150, 150);
    await faceapi.detectFaceLandmarks(face);
    await faceapi.computeFaceDescriptor(face);
  })().catch((e) => {
    warmPromise = null;
    throw e;
  });
  return warmPromise;
}

export type ImageScan =
  | { status: "no-face"; brightness: number }
  | { status: "multiple-faces"; brightness: number; faces: number }
  | { status: "too-small"; brightness: number; faceWidth: number }
  | { status: "not-clear"; brightness: number }
  | {
      status: "ok";
      descriptor: number[];
      /** Face box in the coordinates of the canvas that was passed in. */
      box: Omit<Box, "score">;
      brightness: number;
      yaw: number;
      /** How many faces were in the photo (the largest one was used). */
      faces: number;
      /** Downscaled copy (max 1280 px) + face box on it, for previews / dataset upload. */
      preview: { canvas: HTMLCanvasElement; box: Omit<Box, "score"> };
    };

let ssdPromise: Promise<void> | null = null;
/** SSD MobileNet: slower but finds small faces the tiny detector misses. Loaded only when needed. */
export function loadSsd(): Promise<void> {
  ssdPromise ??= loadEngine()
    .then(({ faceapi }) => faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL))
    .catch((e) => {
      ssdPromise = null;
      throw e;
    });
  return ssdPromise;
}

function resized(source: HTMLCanvasElement, maxSide: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  if (scale === 1) return { canvas: source, scale };
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * scale);
  c.height = Math.round(source.height * scale);
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return { canvas: c, scale };
}

/**
 * Analyses a still photo (upload). Pass the photo at FULL resolution (up to ~3000 px).
 *
 *  1. Find faces on a 1280 px copy — tiny detector (608) first, SSD MobileNet if none found.
 *  2. Several faces: use the largest only if it clearly dominates (1.8× the next by area).
 *  3. Crop that face from the full-resolution photo and compute landmarks + descriptor on the
 *     crop, so even a face that is small in a large photo gets a sharp signature.
 */
export async function scanImage(source: HTMLCanvasElement): Promise<ImageScan> {
  const { faceapi } = await loadEngine();
  const brightness = meanBrightness(source);
  const { canvas: det, scale } = resized(source, 1280);

  let faces = await faceapi.detectAllFaces(det, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.35 }));
  if (faces.length === 0) {
    await loadSsd();
    faces = await faceapi.detectAllFaces(det, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }));
  }
  if (faces.length === 0) return { status: "no-face", brightness };
  faces.sort((p, q) => q.box.area - p.box.area);
  if (faces.length > 1 && faces[0].box.area < 1.8 * faces[1].box.area) return { status: "multiple-faces", brightness, faces: faces.length };

  const d = faces[0].box;
  const box = { x: d.x / scale, y: d.y / scale, width: d.width / scale, height: d.height / scale };
  if (box.width < 40) return { status: "too-small", brightness, faceWidth: Math.round(box.width) };

  const side = Math.min(Math.max(box.width, box.height) * 2.2, source.width, source.height);
  const cx = Math.max(0, Math.min(source.width - side, box.x + box.width / 2 - side / 2));
  const cy = Math.max(0, Math.min(source.height - side, box.y + box.height / 2 - side / 2));
  const crop = document.createElement("canvas");
  crop.width = 320;
  crop.height = 320;
  crop.getContext("2d")!.drawImage(source, cx, cy, side, side, 0, 0, 320, 320);

  let r = await faceapi.detectSingleFace(crop, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
  if (!r) {
    await loadSsd();
    r = await faceapi.detectSingleFace(crop, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor();
  }
  if (!r) return { status: "not-clear", brightness: meanBrightness(crop) };

  return {
    status: "ok",
    descriptor: Array.from(r.descriptor),
    box,
    brightness: meanBrightness(crop),
    yaw: estimateYaw(r.landmarks.positions),
    faces: faces.length,
    preview: { canvas: det, box: { x: d.x, y: d.y, width: d.width, height: d.height } },
  };
}

/**
 * [4] Simple blink-based liveness check.
 * Learns the "eyes open" level, then waits for a clear dip and recovery.
 * NOTE: stops printed photos, but not video replays — see README limitations.
 */
export function createBlinkDetector() {
  const samples: number[] = [];
  let closed = false;
  let blinked = false;
  return {
    /** Feed one eye-aspect-ratio reading; returns true once a blink (dip + recovery) has been seen. */
    push(ear: number): boolean {
      if (blinked) return true;
      samples.push(ear);
      if (samples.length > 40) samples.shift();
      if (samples.length < 4) return false;
      // "Eyes open" level = 75th percentile of recent readings (robust to the blink itself and to noise).
      const sorted = [...samples].sort((x, y) => x - y);
      const open = sorted[Math.floor(sorted.length * 0.75)];
      if (!closed && ear < open * 0.82) closed = true;
      else if (closed && ear > open * 0.92) blinked = true;
      return blinked;
    },
    get passed() {
      return blinked;
    },
    reset() {
      samples.length = 0;
      closed = false;
      blinked = false;
    },
  };
}

/**
 * Backup liveness challenge: turn the head to one side, then back to the camera.
 * Measured RELATIVE to the person's own starting position, so a webcam that sits below or
 * beside the screen (which makes "straight ahead" read as a slight turn) still works.
 * A printed photo can't do this.
 */
export const HEAD_TURN_TARGET = 0.15;

export function createHeadTurnDetector() {
  const start: number[] = [];
  let baseline: number | null = null;
  let turned = false;
  let passed = false;
  let maxDev = 0;
  return {
    push(yaw: number): boolean {
      if (passed) return true;
      if (baseline === null) {
        start.push(yaw);
        if (start.length >= 4) baseline = [...start].sort((x, y) => x - y)[Math.floor(start.length / 2)];
        return false;
      }
      const dev = Math.abs(yaw - baseline);
      maxDev = Math.max(maxDev, dev);
      if (!turned && dev > HEAD_TURN_TARGET) turned = true;
      else if (turned && dev < HEAD_TURN_TARGET * 0.5) passed = true;
      return passed;
    },
    /** 0–1: how far toward the required turn the person has gone. */
    get progress() {
      return passed ? 1 : Math.min(1, maxDev / HEAD_TURN_TARGET);
    },
    get turned() {
      return turned;
    },
    get passed() {
      return passed;
    },
    reset() {
      start.length = 0;
      baseline = null;
      turned = false;
      passed = false;
      maxDev = 0;
    },
  };
}

export function averageDescriptors(list: number[][]): number[] {
  const out = new Array(list[0].length).fill(0);
  for (const d of list) d.forEach((v, i) => (out[i] += v));
  return out.map((v) => v / list.length);
}

export const SCAN_MESSAGES: Record<ScanResult["status"], string> = {
  "no-face": "No face detected — look at the camera.",
  "multiple-faces": "More than one face detected — only the voter should be in view.",
  "face-not-clear": "Face not clear — move closer and improve the lighting.",
  ok: "Face detected.",
};
