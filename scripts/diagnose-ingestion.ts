// Diagnoses the connection to Edge Impulse's ingestion server (no data is uploaded).
// `npx tsx --env-file=.env scripts/diagnose-ingestion.ts`
import dns from "node:dns/promises";

const why = (e: unknown) => {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  return `${err.name}: ${err.message}${err.cause ? ` → cause: ${err.cause.code ?? ""} ${err.cause.message ?? ""}` : ""}`;
};

(async () => {
  for (const host of ["studio.edgeimpulse.com", "ingestion.edgeimpulse.com"]) {
    try {
      const a = await dns.lookup(host, { all: true });
      console.log(`DNS ${host}: ${a.map((x) => x.address).join(", ")}`);
    } catch (e) {
      console.log(`DNS ${host}: FAILED ${why(e)}`);
    }
  }
  // Unauthenticated request: proves reachability, creates nothing.
  try {
    const r = await fetch("https://ingestion.edgeimpulse.com/api/training/files", { method: "POST", signal: AbortSignal.timeout(15000) });
    console.log(`POST ingestion without key → HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    console.log(`POST ingestion without key → ${why(e)}`);
  }
  // Authenticated request with an EMPTY form: checks the key on the ingestion server, uploads nothing.
  try {
    const r = await fetch("https://ingestion.edgeimpulse.com/api/training/files", {
      method: "POST",
      headers: { "x-api-key": process.env.EDGE_IMPULSE_API_KEY ?? "" },
      body: new FormData(),
      signal: AbortSignal.timeout(15000),
    });
    console.log(`POST ingestion with key, empty form → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  } catch (e) {
    console.log(`POST ingestion with key, empty form → ${why(e)}`);
  }
})();
