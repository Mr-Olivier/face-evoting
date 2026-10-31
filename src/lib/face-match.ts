// Server-side face embedding maths. The SERVER decides whether faces match,
// never the browser.
import { config } from "./config";

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Descriptor length mismatch");
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function averageDescriptor(samples: number[][]): number[] {
  const out = new Array(samples[0].length).fill(0);
  for (const s of samples) for (let i = 0; i < s.length; i++) out[i] += s[i];
  return out.map((v) => v / samples.length);
}

/**
 * All enrolment samples should look like the same person. Front / left / right poses
 * differ a little more than repeated front shots, so a small allowance (+0.1) is added;
 * two different people are normally well beyond it.
 */
export function samplesAreConsistent(samples: number[][]): { ok: boolean; maxDistance: number } {
  let maxDistance = 0;
  for (let i = 0; i < samples.length; i++)
    for (let j = i + 1; j < samples.length; j++)
      maxDistance = Math.max(maxDistance, euclideanDistance(samples[i], samples[j]));
  return { ok: maxDistance <= config.faceMatchThreshold + 0.1, maxDistance };
}

export function isMatch(live: number[], enrolled: number[]) {
  const distance = euclideanDistance(live, enrolled);
  return { match: distance <= config.faceMatchThreshold, distance, threshold: config.faceMatchThreshold };
}
