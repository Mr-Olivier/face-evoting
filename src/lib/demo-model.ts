/**
 * Demo stand-in for the trained Edge Impulse face detector.
 *
 * Until you export your own model (see docs/MODEL_TRAINING.md), this module
 * behaves like the Edge Impulse WebAssembly export: it reports the same
 * model properties and returns the same `run_classifier()` result shape —
 * boxes labelled "face", in MODEL-INPUT pixel coordinates (e.g. 96×96).
 *
 * Under the hood it uses face-api's TinyFaceDetector, so the camera, the
 * overlay, the "one face only" rule and the rest of the pipeline all work
 * exactly as they will with the real model. Drop the real export into
 * public/models/edge-impulse/ and the app switches to it automatically.
 *
 * CLIENT-SIDE ONLY.
 */
import type * as FaceApi from "@vladmandic/face-api";
import type { EIBox, EIProperties } from "./edge-impulse";

/** Mirrors the properties of the model described in public/models/edge-impulse/model-card.json */
export const DEMO_PROPERTIES: EIProperties = {
  model_type: "constrained_object_detection",
  image_input_width: 96,
  image_input_height: 96,
  image_channel_count: 1,
  labels: ["face"],
};

export type DemoModel = {
  properties: EIProperties;
  /** Same contract as Edge Impulse: boxes in model-input pixels. */
  detect(video: HTMLVideoElement): Promise<EIBox[]>;
};

export function createDemoModel(faceapi: typeof FaceApi): DemoModel {
  const w = Number(DEMO_PROPERTIES.image_input_width);
  const h = Number(DEMO_PROPERTIES.image_input_height);
  return {
    properties: DEMO_PROPERTIES,
    async detect(video) {
      const dets = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }));
      const sx = w / video.videoWidth;
      const sy = h / video.videoHeight;
      return dets.map((d) => ({
        label: "face",
        value: d.score,
        x: d.box.x * sx,
        y: d.box.y * sy,
        width: d.box.width * sx,
        height: d.box.height * sy,
      }));
    },
  };
}
