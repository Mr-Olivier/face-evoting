import { NextResponse } from "next/server";
import { pinResetVerifySchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { cookieOptions } from "@/lib/auth";
import { clientIpHash, lockState, recordAttempt } from "@/lib/attempts";
import { OTP_MAX_WRONG, PIN_RESET_COOKIE, otpMatches, readResetToken, signResetToken, wrongCodesSince } from "@/lib/pin-reset";

const EXPIRED = () =>
  apiError("CODE_EXPIRED", 401, "This reset code has expired or was already used.", {
    hint: "Ask for a new code. Codes are valid for 10 minutes and can be used once.",
  });

/**
 * POST /api/voters/pin-reset/verify   Body: { code }
 * Step 2: checks the emailed code. On success the cookie is upgraded so the new PIN can be set.
 */
export async function POST(req: Request) {
  const token = await readResetToken();
  if (!token || !token.otpHash) return EXPIRED();

  const parsed = pinResetVerifySchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const ipHash = clientIpHash(req);

  const lock = await lockState(token.nationalId, ipHash);
  if (lock.locked) {
    const res = apiError("LOCKED", 429, "This National ID is temporarily locked after too many failed attempts.", {
      hint: `Try again in ${lock.retryInMinutes} minutes.`,
    });
    res.cookies.delete(PIN_RESET_COOKIE);
    return res;
  }

  const wrong = await wrongCodesSince(token.nationalId, token.issuedAt);
  if (wrong >= OTP_MAX_WRONG) {
    const res = apiError("CODE_EXPIRED", 401, "Too many wrong codes. This code no longer works.", { hint: "Ask for a new code." });
    res.cookies.delete(PIN_RESET_COOKIE);
    return res;
  }

  if (!otpMatches(parsed.data.code, token.voterId, token.jti, token.otpHash)) {
    await recordAttempt({ identifier: token.nationalId, stage: "otp", success: false, reason: "wrong_otp", voterId: token.voterId, ipHash });
    const left = Math.min(OTP_MAX_WRONG - wrong - 1, lock.remaining - 1);
    return apiError("WRONG_CODE", 401, "That code is not correct.", {
      hint: left > 0 ? `Check the latest email and try again. ${left} attempt${left === 1 ? "" : "s"} left.` : "No attempts left. Ask for a new code.",
      fieldErrors: { code: "Incorrect code." },
      remaining: left,
    });
  }

  const res = NextResponse.json({ ok: true, verified: true });
  // Upgrade: verified, no code inside, same jti, 10 more minutes to choose the PIN.
  res.cookies.set(
    PIN_RESET_COOKIE,
    await signResetToken({ voterId: token.voterId, nationalId: token.nationalId, jti: token.jti, pinHash: token.pinHash, verified: true }),
    cookieOptions(10 * 60),
  );
  return res;
}
