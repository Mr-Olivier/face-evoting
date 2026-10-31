# Put your Edge Impulse WebAssembly export here

Full guide: [`docs/MODEL_TRAINING.md`](../../../docs/MODEL_TRAINING.md)

1. In Edge Impulse Studio → **Deployment** → **WebAssembly** → **Build**.
2. Unzip the download and copy these two files into this folder:

```
public/models/edge-impulse/
├── edge-impulse-standalone.js     ← from the export
├── edge-impulse-standalone.wasm   ← from the export
└── model-card.json                ← update with your real metrics, set "isSample": false
```

(`run-impulse.js` from the zip is not needed — `src/lib/edge-impulse.ts` does the same job.)

3. Restart `npm run dev`. In the admin console, **AI model** should now say *Trained Edge Impulse model active*.

While these files are missing, the app runs a **demo model** with the same output
format (set `NEXT_PUBLIC_DEMO_MODEL="false"` to use plain face-api detection instead).
