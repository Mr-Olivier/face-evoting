// Self-check of the liveness rules with simulated readings: `npx tsx scripts/check-liveness.ts`
import assert from "node:assert/strict";
import { createBlinkDetector, createHeadTurnDetector } from "../src/lib/face-pipeline";

const feed = (d: { push(v: number): boolean }, values: number[]) => values.some((v) => d.push(v));
const jitter = (base: number, n: number, amp = 0.01) => Array.from({ length: n }, (_, i) => base + Math.sin(i * 1.7) * amp);

// Camera below/beside the screen: "straight ahead" already reads yaw ≈ 0.12.
assert.ok(!feed(createHeadTurnDetector(), jitter(0.12, 40)), "still face with offset camera must NOT pass");
assert.ok(feed(createHeadTurnDetector(), [...jitter(0.12, 6), 0.18, 0.24, 0.3, 0.29, 0.22, 0.16, 0.13, 0.12]), "turn away from offset baseline and back passes");
assert.ok(feed(createHeadTurnDetector(), [...jitter(0.12, 6), 0.05, -0.02, -0.04, 0.03, 0.1, 0.12]), "turn to the other side passes");
// The old absolute rule required |yaw| < 0.1 at the end, impossible with a 0.12 baseline:
assert.ok(!feed(createHeadTurnDetector(), [...jitter(0.12, 6), 0.16, 0.18, 0.17]), "a tiny drift is not a turn");

// Blink: open ≈ 0.30, a modest dip to 0.24 (20%) then recovery.
assert.ok(feed(createBlinkDetector(), [...jitter(0.3, 8, 0.005), 0.24, 0.29, 0.3]), "modest one-frame blink is caught");
assert.ok(!feed(createBlinkDetector(), jitter(0.3, 60, 0.01)), "steady open eyes (e.g. a photo) must NOT pass");

console.log("Liveness checks passed.");
