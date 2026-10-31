// Checks the Edge Impulse connection from .env: `npx tsx --env-file=.env scripts/check-edge-impulse.ts`
import { getProject } from "../src/lib/edge-impulse-api";

(async () => {
  const r = await getProject();
  if (r.ok) console.log(`Connected to Edge Impulse project "${r.project.name}" (id ${r.project.id})\n${r.project.studioUrl}`);
  else {
    console.error(`Not connected: ${r.error}`);
    process.exit(1);
  }
})();
