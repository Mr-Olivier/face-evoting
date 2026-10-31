// Copies the face-api model weights that ship inside the npm package into
// public/models/face-api, so the camera works offline (no CDN needed).
// Runs automatically after `npm install`; run manually with `npm run models:download`.
//
// The weight files are renamed from *.bin to *.shard (and the manifests updated).
// Download managers such as Internet Download Manager (IDM) intercept every ".bin"
// request in the browser, which makes the models arrive EMPTY and breaks face
// detection with "the tensor should have N values but has 0".
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "node_modules", "@vladmandic", "face-api", "model");
// ssd_mobilenetv1 is a slower but more accurate detector, used only for uploaded photos.
const MODELS = ["tiny_face_detector_model", "ssd_mobilenetv1_model", "face_landmark_68_model", "face_recognition_model"];

const outDir = path.join(process.cwd(), "public", "models", "face-api");
await mkdir(outDir, { recursive: true });

for (const model of MODELS) {
  const manifestName = `${model}-weights_manifest.json`;
  const manifest = JSON.parse(await readFile(path.join(SRC, manifestName), "utf8"));
  for (const group of manifest) {
    group.paths = await Promise.all(
      group.paths.map(async (p) => {
        const renamed = p.replace(/\.bin$/, ".shard");
        await copyFile(path.join(SRC, p), path.join(outDir, renamed));
        await rm(path.join(outDir, p), { force: true }); // remove old .bin copies
        console.log("✔", renamed);
        return renamed;
      }),
    );
  }
  await writeFile(path.join(outDir, manifestName), JSON.stringify(manifest));
  console.log("✔", manifestName);
}
console.log(`\nDone. face-api models are in public/models/face-api (NEXT_PUBLIC_FACE_MODELS_URL="/models/face-api").`);
