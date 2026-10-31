/**
 * Browser loader for an Edge Impulse WebAssembly export.
 *
 * Expected files (from Edge Impulse Studio → Deployment → WebAssembly):
 *   public/models/edge-impulse/edge-impulse-standalone.js
 *   public/models/edge-impulse/edge-impulse-standalone.wasm
 *
 * This mirrors the logic of the `run-impulse.js` file that ships in the export.
 * If your export's API differs, compare with that file and adjust `classify()`.
 *
 * CLIENT-SIDE ONLY.
 */

const BASE_PATH = "/models/edge-impulse";
const SCRIPT_URL = `${BASE_PATH}/edge-impulse-standalone.js`;

export type EIBox = { label: string; value: number; x: number; y: number; width: number; height: number };
export type EIResult = { results: EIBox[]; anomaly?: number };
export type EIProperties = {
  model_type?: string;
  image_input_width?: number;
  image_input_height?: number;
  image_channel_count?: number;
  input_width?: number;
  input_height?: number;
  [key: string]: unknown;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type EIModule = any;

let modulePromise: Promise<EIModule | null> | null = null;

/** Loads the WASM model once. Resolves to null if the files are not present. */
export function loadEdgeImpulse(): Promise<EIModule | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const head = await fetch(SCRIPT_URL, { method: "HEAD" }).catch(() => null);
    if (!head || !head.ok) {
      console.info("[edge-impulse] No WebAssembly export found in public/models/edge-impulse — using fallback detector.");
      return null;
    }

    return new Promise<EIModule | null>((resolve) => {
      const w = window as any;
      // Emscripten reads the global `Module` object before it initialises.
      w.Module = {
        locateFile: (file: string) => `${BASE_PATH}/${file}`,
        onRuntimeInitialized: () => {
          try {
            w.Module.init?.();
            resolve(w.Module);
          } catch (e) {
            console.error("[edge-impulse] init failed", e);
            resolve(null);
          }
        },
      };
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  })();

  return modulePromise;
}

export function getProperties(mod: EIModule): EIProperties {
  return mod.get_properties();
}

export function getInputSize(props: EIProperties): { width: number; height: number } {
  return {
    width: Number(props.image_input_width ?? props.input_width ?? 96),
    height: Number(props.image_input_height ?? props.input_height ?? 96),
  };
}

/** Converts canvas RGBA pixels into Edge Impulse's packed 0xRRGGBB feature format. */
export function imageDataToFeatures(data: ImageData): number[] {
  const px = data.data;
  const features = new Array(data.width * data.height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    features[j] = (px[i] << 16) + (px[i + 1] << 8) + px[i + 2];
  }
  return features;
}

/** Runs one inference. `features` must match the model's input size. */
export function classify(mod: EIModule, features: number[]): EIResult {
  const props = getProperties(mod);
  const typed = new Float32Array(features);
  const numBytes = typed.length * typed.BYTES_PER_ELEMENT;
  const ptr = mod._malloc(numBytes);
  const heap = new Uint8Array(mod.HEAPU8.buffer, ptr, numBytes);
  heap.set(new Uint8Array(typed.buffer));

  const ret = mod.run_classifier(heap.byteOffset, features.length, false);
  mod._free(ptr);
  if (ret.result !== 0) throw new Error(`Edge Impulse classification failed (code ${ret.result})`);

  const isDetection =
    props.model_type === "object_detection" || props.model_type === "constrained_object_detection";
  const results: EIBox[] = [];
  for (let i = 0; i < ret.size(); i++) {
    const c = ret.get(i);
    results.push(
      isDetection
        ? { label: c.label, value: c.value, x: c.x, y: c.y, width: c.width, height: c.height }
        : { label: c.label, value: c.value, x: 0, y: 0, width: 0, height: 0 },
    );
    c.delete();
  }
  const anomaly = ret.anomaly;
  ret.delete();
  return { results, anomaly };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
