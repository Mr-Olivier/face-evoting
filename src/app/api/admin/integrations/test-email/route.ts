import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { testEmailSchema } from "@/lib/validation";
import { apiError, readJson, unauthorized, zodError } from "@/lib/api";
import { emailConfig, sendEmail } from "@/lib/email/mailer";
import { testEmail } from "@/lib/email/templates";

// POST /api/admin/integrations/test-email   Body: { to }
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = testEmailSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  const cfg = emailConfig();
  if (!cfg.configured)
    return apiError("EMAIL_NOT_CONFIGURED", 503, `Email is not configured: missing ${cfg.missing.join(", ")}.`, {
      hint:
        cfg.provider === "gmail"
          ? "Set GMAIL_USER and GMAIL_APP_PASSWORD in .env (see docs/EDGE_IMPULSE_QUICK_STEPS.md → Gmail), then restart the server."
          : "Set BREVO_API_KEY and BREVO_SENDER_EMAIL (a sender verified in Brevo) in .env, then restart the server.",
    });

  const result = await sendEmail({ type: "test", to: parsed.data.to, ...testEmail(cfg.provider) });
  if (result.status !== "SENT")
    return apiError("EMAIL_FAILED", 502, result.error ?? "The email was not sent.", {
      hint:
        cfg.provider === "gmail"
          ? "Use an App Password (16 characters) from myaccount.google.com/apppasswords. 2-Step Verification must be on."
          : "Check that the API key is active and the sender address is verified in Brevo.",
    });
  return NextResponse.json({ ok: true, messageId: result.providerId });
}
