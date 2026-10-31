import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { pinResetCompleteSchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { clientIpHash, recordAttempt } from "@/lib/attempts";
import { sendEmail } from "@/lib/email/mailer";
import { pinChangedEmail } from "@/lib/email/templates";
import { PIN_RESET_COOKIE, readResetToken } from "@/lib/pin-reset";
import { formatKigali, weakPinProblem } from "@/lib/rwanda";

/**
 * POST /api/voters/pin-reset/complete   Body: { pin, pinConfirm }
 * Step 3: sets the new PIN (same strength rules as registration) and emails a security notice.
 */
export async function POST(req: Request) {
  const token = await readResetToken();
  if (!token || !token.verified)
    return apiError("CODE_EXPIRED", 401, "Your reset session has expired.", { hint: "Start again and ask for a new code." });

  const parsed = pinResetCompleteSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const { pin } = parsed.data;

  const voter = await prisma.voter.findUnique({
    where: { id: token.voterId },
    select: { id: true, firstName: true, email: true, nationalId: true, phone: true, dateOfBirth: true, pinHash: true },
  });
  if (!voter) return apiError("NOT_REGISTERED", 404, "Voter not found.");

  const weak = weakPinProblem(pin, { dob: voter.dateOfBirth.toISOString().slice(0, 10), nationalId: voter.nationalId, phone: voter.phone });
  if (weak) return apiError("WEAK_PIN", 400, weak, { fieldErrors: { pin: weak }, hint: "Choose 6 digits that others can't guess." });
  if (await bcrypt.compare(pin, voter.pinHash))
    return apiError("SAME_PIN", 400, "The new PIN must be different from your old PIN.", { fieldErrors: { pin: "Choose a PIN you haven't used before." } });

  await prisma.voter.update({ where: { id: voter.id }, data: { pinHash: await bcrypt.hash(pin, 10) } });
  await recordAttempt({ identifier: voter.nationalId, stage: "otp", success: true, reason: "pin_reset", voterId: voter.id, ipHash: clientIpHash(req) });

  if (voter.email) {
    const email = voter.email;
    const mail = pinChangedEmail({ firstName: voter.firstName, changedAt: formatKigali(new Date()) });
    after(() => sendEmail({ type: "pin_changed", to: email, ...mail }).then(() => undefined));
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PIN_RESET_COOKIE);
  return res;
}
