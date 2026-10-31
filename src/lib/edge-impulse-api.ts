/**
 * Server-side connection to YOUR Edge Impulse project (works on the free plan).
 *
 *  - Studio API     — reads the project linked to the API key (name, id)
 *  - Ingestion API  — uploads labelled training images straight into the project:
 *                     https://docs.edgeimpulse.com/reference/data-ingestion/ingestion-api
 *
 * Images are uploaded with a `bounding_boxes.labels` file, so every face arrives
 * already labelled "face" — review them in Studio's labelling queue, then train.
 * Nothing is stored in the FaceVote database; images go only to Edge Impulse.
 */
const STUDIO = "https://studio.edgeimpulse.com/v1/api";
const INGESTION = "https://ingestion.edgeimpulse.com/api";

export function edgeImpulseConfig() {
  const apiKey = process.env.EDGE_IMPULSE_API_KEY?.trim();
  return { configured: Boolean(apiKey), apiKey };
}

export type EIProject = { id: number; name: string; studioUrl: string };

type ProjectResult = { ok: true; project: EIProject } | { ok: false; error: string };
let cached: { at: number; result: ProjectResult } | null = null;

/** Project linked to the API key. Cached for 60 s so admin pages stay fast. */
export async function getProject(force = false): Promise<ProjectResult> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.result;
  const result = await fetchProject();
  cached = { at: Date.now(), result };
  return result;
}

async function fetchProject(): Promise<ProjectResult> {
  const { configured, apiKey } = edgeImpulseConfig();
  if (!configured) return { ok: false, error: "EDGE_IMPULSE_API_KEY is not set." };
  try {
    const res = await fetch(`${STUDIO}/projects`, { headers: { "x-api-key": apiKey!, accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; projects?: { id: number; name: string }[] };
    if (!res.ok || body.success === false) return { ok: false, error: body.error ?? `Edge Impulse returned HTTP ${res.status}.` };
    const p = body.projects?.[0];
    if (!p) return { ok: false, error: "The API key is valid but no project was returned." };
    return { ok: true, project: { id: p.id, name: p.name, studioUrl: `https://studio.edgeimpulse.com/studio/${p.id}` } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Edge Impulse." };
  }
}

export type UploadImage = {
  jpeg: Buffer;
  filename: string;
  boxes: { x: number; y: number; width: number; height: number }[];
};

/** Explains a low-level network error (Node's fetch hides the real reason in `cause`). */
function describeNetworkError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err?.name === "TimeoutError") return "Edge Impulse took too long to answer (30 s).";
  const code = err?.cause?.code ?? "";
  const reason = err?.cause?.message ?? err?.message ?? "Could not reach Edge Impulse.";
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "No internet connection (couldn't find ingestion.edgeimpulse.com).";
  if (/ECONNRESET|UND_ERR_SOCKET/.test(code)) return `The connection to Edge Impulse was reset (${code}).`;
  return code ? `${reason} (${code})` : reason;
}

/**
 * Builds the multipart body as ONE buffer with an exact Content-Length.
 * Passing a FormData object to fetch inside Next.js can produce a streamed (chunked) upload,
 * which Edge Impulse's ingestion endpoint resets — showing up only as "fetch failed".
 */
function multipart(parts: { name: string; filename: string; type: string; data: Buffer }[]) {
  const CRLF = String.fromCharCode(13, 10);
  const boundary = `----FaceVote${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"${CRLF}Content-Type: ${p.type}${CRLF}${CRLF}`),
      p.data,
      Buffer.from(CRLF),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export type UploadResult = { ok: true; count: number; sampleIds: number[] } | { ok: false; status: number; error: string };

/** Uploads images (with bounding boxes) to the training or testing split. Retries once on a network error. */
export async function uploadImages(images: UploadImage[], category: "training" | "testing"): Promise<UploadResult> {
  const { configured, apiKey } = edgeImpulseConfig();
  if (!configured) return { ok: false, status: 503, error: "EDGE_IMPULSE_API_KEY is not set." };

  const labels: Record<string, { label: string; x: number; y: number; width: number; height: number }[]> = {};
  const parts = images.map((img) => {
    labels[img.filename] = img.boxes.map((b) => ({
      label: "face",
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.round(b.width),
      height: Math.round(b.height),
    }));
    return { name: "data", filename: img.filename, type: "image/jpeg", data: img.jpeg };
  });
  parts.push({
    name: "data",
    filename: "bounding_boxes.labels",
    type: "application/json",
    data: Buffer.from(JSON.stringify({ version: 1, type: "bounding-box-labels", boundingBoxes: labels })),
  });
  const { body, contentType } = multipart(parts);

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${INGESTION}/${category}/files`, {
        method: "POST",
        headers: { "x-api-key": apiKey!, "x-add-date-id": "1", "content-type": contentType, "content-length": String(body.length) },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      const raw = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: raw.slice(0, 300) || `HTTP ${res.status}` };
      let sampleIds: number[] = [];
      try {
        const parsed = JSON.parse(raw) as { files?: { success?: boolean; sampleId?: number; error?: string }[] };
        const failed = parsed.files?.find((f) => f.success === false);
        if (failed) return { ok: false, status: 400, error: failed.error ?? "Edge Impulse rejected a file." };
        sampleIds = (parsed.files ?? []).map((f) => f.sampleId).filter((x): x is number => typeof x === "number");
      } catch {
        /* older response format — still a success */
      }
      return { ok: true, count: images.length, sampleIds };
    } catch (e) {
      lastError = describeNetworkError(e);
      console.warn(`[edge-impulse] upload attempt ${attempt} failed: ${lastError}`);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { ok: false, status: 502, error: lastError };
}
