// Server-side: reads the model card and checks whether a real Edge Impulse export is installed.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "models", "edge-impulse");

export type ModelCard = {
  isSample: boolean;
  note?: string;
  name: string;
  version: string;
  edgeImpulseProject: string;
  task: string;
  architecture: string;
  labels: string[];
  input: { width: number; height: number; colorDepth: string; resizeMode: string };
  training: { cycles: number; learningRate: number; validationSplit: number; dataAugmentation: boolean };
  dataset: {
    volunteers: number;
    totalImages: number;
    faceImages: number;
    backgroundImages: number;
    trainImages: number;
    testImages: number;
    boundingBoxes: number;
  };
  metrics: { f1: number; precision: number; recall: number; testAccuracy: number };
  confusionMatrix: { labels: string[]; rows: number[][] };
  onDevice: { target: string; inferenceMs: number; ramKb: number; flashKb: number };
};

export async function getModelCard(): Promise<ModelCard | null> {
  try {
    return JSON.parse(await readFile(path.join(DIR, "model-card.json"), "utf8")) as ModelCard;
  } catch {
    return null;
  }
}

async function exists(file: string) {
  try {
    return (await stat(path.join(DIR, file))).isFile();
  } catch {
    return false;
  }
}

/** Which detector the browser will use, as far as the server can tell. */
export async function getModelStatus() {
  const exportInstalled = (await exists("edge-impulse-standalone.js")) && (await exists("edge-impulse-standalone.wasm"));
  const useEdgeImpulse = process.env.NEXT_PUBLIC_USE_EDGE_IMPULSE !== "false";
  const useDemo = process.env.NEXT_PUBLIC_DEMO_MODEL !== "false";
  const mode = useEdgeImpulse && exportInstalled ? "edge-impulse" : useEdgeImpulse && useDemo ? "demo" : "face-api";
  return { exportInstalled, mode } as const;
}
