import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { isAdmin } from "@/lib/auth";
import { datasetUploadSchema } from "@/lib/validation";
import { apiError, readJson, unauthorized, zodError } from "@/lib/api";
import { edgeImpulseConfig, uploadImages } from "@/lib/edge-impulse-api";

/**
 * POST /api/admin/dataset — send captured frames to the Edge Impulse project for training.
 * Body: { kind: "face" | "background", consent, subjectCode?, images: [{ dataUrl, width, height, boxes }] }
 *
 * - Face images require recorded consent and at least one face box per image.
 * - Background images must contain no face boxes.
 * - `split`: "training", "testing", or "auto" (80 % / 20 % per request, like Studio's automatic split).
 * - Images are forwarded to Edge Impulse only; nothing is stored by FaceVote.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  if (!edgeImpulseConfig().configured)
    return apiError("EI_NOT_CONFIGURED", 503, "Edge Impulse is not connected.", {
      hint: "Add EDGE_IMPULSE_API_KEY to .env (Edge Impulse Studio → Dashboard → Keys) and restart the server.",
    });

  const parsed = datasetUploadSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const { kind, split, consent, subjectCode, images } = parsed.data;

  if (kind === "face" && !consent)
    return apiError("CONSENT_REQUIRED", 400, "Consent has not been recorded for this person.", {
      hint: "Only upload face images of people who have signed the data-collection consent form.",
    });
  if (kind === "face" && images.some((i) => i.boxes.length === 0))
    return apiError("NO_FACE_BOX", 400, "Every face image must contain at least one detected face.", { hint: "Wait until the face is detected, then capture." });
  if (kind === "background" && images.some((i) => i.boxes.length > 0))
    return apiError("FACE_IN_BACKGROUND", 400, "A background image contains a face.", { hint: "Point the camera away from people before capturing background images." });

  const prepared = [];
  for (const [i, img] of images.entries()) {
    const jpeg = Buffer.from(img.dataUrl.slice("data:image/jpeg;base64,".length), "base64");
    if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff)
      return apiError("INVALID_IMAGE", 400, `Image ${i + 1} is not a valid JPEG.`);
    // Clamp boxes to the image so Edge Impulse never receives out-of-bounds labels.
    const boxes = img.boxes.map((b) => {
      const x = Math.max(0, Math.min(img.width - 1, b.x));
      const y = Math.max(0, Math.min(img.height - 1, b.y));
      return { x, y, width: Math.min(img.width - x, b.width), height: Math.min(img.height - y, b.height) };
    });
    const prefix = kind === "face" ? `face.${subjectCode || "anon"}` : "background";
    prepared.push({ jpeg, filename: `${prefix}.${Date.now()}${i}.jpg`, boxes });
  }

  const category = split === "auto" ? (randomInt(100) < 80 ? "training" : "testing") : split;
  const result = await uploadImages(prepared, category);
  if (!result.ok) {
    const hint =
      result.status === 401 || result.status === 403
        ? "Edge Impulse rejected the API key. Copy a fresh key from Studio → Dashboard → Keys."
        : "Check your internet connection and try again.";
    return apiError("EI_UPLOAD_FAILED", 502, `Edge Impulse did not accept the upload: ${result.error}`, { hint });
  }
  return NextResponse.json({ ok: true, uploaded: result.count, category, sampleIds: result.sampleIds });
}
