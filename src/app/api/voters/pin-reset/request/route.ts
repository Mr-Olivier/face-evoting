import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { pinResetRequestSchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { cookieOptions } from "@/lib/auth";
import { clientIpHash, lockState, recordAttempt } from "@/lib/attempts";
import { emailConfig, sendEmail } from "@/lib/email/mailer";
import { pinResetCodeEmail } from "@/lib/email/templates";
import { OTP_MAX_REQUESTS, OTP_MINUTES, OTP_RESEND_SECONDS, PIN_RESET_COOKIE, newOtp, requestThrottle, signResetToken } from "@/lib/pin-reset";
import { maskEmail } from "@/lib/rwanda";

/**
 * POST /api/voters/pin-reset/request   Body: { nationalId }
 * Step 1 of the "Forgot PIN" flow: emails a 6-digit one-time code to the address on the registration.
 */
export async function POST(req: Request) {
  const parsed = pinResetRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const { nationalId } = parsed.data;
  const ipHash = clientIpHash(req);

  const lock = await lockState(nationalId, ipHash);
  if (lock.ipBlocked)
    return apiError("TOO_MANY_REQUESTS", 429, "Too many failed attempts from this device.", { hint: `Wait ${config.lockoutMinutes} minutes and try again.` });
  if (lock.locked)
    return apiError("LOCKED", 429, "This National ID is temporarily locked after too many failed attempts.", {
      hint: `Try again in ${lock.retryInMinutes} minute${lock.retryInMinutes === 1 ? "" : "s"}.`,
      retryInMinutes: lock.retryInMinutes,
    });

  const voter = await prisma.voter.findUnique({
    where: { nationalId },
    select: { id: true, firstName: true, email: true, pinHash: true, isEligible: true },
  });
  if (!voter) {
    await recordAttempt({ identifier: nationalId, stage: "otp_request", success: false, reason: "not_registered", ipHash });
    return apiError("NOT_REGISTERED", 404, "No voter is registered with this National ID.", {
      hint: `Check the number on your ID card. If it is correct, visit ${config.electionOffice} to register.`,
      fieldErrors: { nationalId: "This National ID is not on the voter register." },
    });
  }
  if (!voter.isEligible)
    return apiError("NOT_ELIGIBLE", 403, "Your registration is currently suspended.", { hint: `Contact ${config.electionOffice}.` });
  if (!voter.email)
    return apiError("NO_EMAIL", 409, "There is no email address on your registration, so we can't send a code.", {
      hint: `Visit ${config.electionOffice} with your National ID card to reset your PIN in person.`,
    });
  if (!emailConfig().configured)
    return apiError("EMAIL_UNAVAILABLE", 503, "PIN reset by email is temporarily unavailable.", {
      hint: `Please try again later, or visit ${config.electionOffice}.`,
    });

  const throttle = await requestThrottle(nationalId);
  if (throttle.waitSeconds > 0)
    return apiError("RESEND_TOO_SOON", 429, `Please wait ${throttle.waitSeconds} seconds before asking for another code.`, {
      hint: "Check your inbox and spam folder for the code we already sent.",
      waitSeconds: throttle.waitSeconds,
    });
  if (throttle.count >= OTP_MAX_REQUESTS)
    return apiError("TOO_MANY_CODES", 429, "Too many codes have been requested for this National ID.", {
      hint: `Wait ${config.lockoutMinutes} minutes, then try again. Use the newest email: older codes stop working.`,
    });

  const otp = newOtp();
  const mail = pinResetCodeEmail({ firstName: voter.firstName, code: otp, minutes: OTP_MINUTES });
  const sent = await sendEmail({ type: "pin_reset_code", to: voter.email, ...mail });
  if (sent.status !== "SENT")
    return apiError("EMAIL_FAILED", 502, "We couldn't send the code email.", { hint: "Please try again in a minute." });

  await recordAttempt({ identifier: nationalId, stage: "otp_request", success: true, reason: "otp_sent", voterId: voter.id, ipHash });

  const res = NextResponse.json({
    ok: true,
    sentTo: maskEmail(voter.email),
    expiresInSeconds: OTP_MINUTES * 60,
    resendInSeconds: OTP_RESEND_SECONDS,
  });
  res.cookies.set(
    PIN_RESET_COOKIE,
    await signResetToken({ voterId: voter.id, nationalId, otp, pinHash: voter.pinHash, verified: false }),
    cookieOptions(OTP_MINUTES * 60),
  );
  return res;
}
