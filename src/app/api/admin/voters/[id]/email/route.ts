import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/auth";
import { apiError, readJson, unauthorized, zodError } from "@/lib/api";
import { emailConfig } from "@/lib/email/mailer";
import { sendVoterEmail } from "@/lib/email/voter-emails";

const bodySchema = z.object({ kind: z.enum(["registration", "vote_confirmation"]) });

/**
 * POST /api/admin/voters/:id/email   Body: { kind: "registration" | "vote_confirmation" }
 * Re-sends a voter's email (e.g. after a network failure). Never includes the PIN or the choice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  if (!emailConfig().configured)
    return apiError("EMAIL_NOT_CONFIGURED", 503, "Email is not configured.", { hint: "Set up Gmail or Brevo on the Integrations page first." });

  const { id } = await params;
  const r = await sendVoterEmail(id, parsed.data.kind);
  if (r.status === "NOT_FOUND") return apiError("NOT_FOUND", 404, "Voter not found.");
  if (r.status === "NO_EMAIL") return apiError("NO_EMAIL", 409, "This voter has no email address on file.");
  if (r.status === "NOT_VOTED") return apiError("NOT_VOTED", 409, "This voter hasn't voted yet, so there is no vote confirmation to send.");
  if (r.status !== "SENT")
    return apiError("EMAIL_FAILED", 502, r.error ?? "The email was not sent.", { hint: "Check Integrations → Email, then try again." });
  return NextResponse.json({ ok: true, to: r.to });
}
