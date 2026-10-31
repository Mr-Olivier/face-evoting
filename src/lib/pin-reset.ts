/**
 * PIN reset by email one-time code (server only).
 *
 * Stateless and single-use, with no extra table:
 *  - The code is never stored in plain text. The cookie holds an HMAC of it keyed with
 *    JWT_SECRET, so a copied cookie can't be brute-forced offline.
 *  - The cookie carries a fingerprint of the voter's CURRENT pinHash. Once the PIN changes,
 *    the fingerprint no longer matches, so the code and cookie can't be reused.
 *  - Requests, wrong codes and successful resets are written to VerificationAttempt
 *    (stages "otp_request" / "otp"), which drives throttling, lockouts and the admin log.
 */
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "./config";
import { prisma } from "./prisma";

export const PIN_RESET_COOKIE = "pin_reset";
export const OTP_MINUTES = 10;
export const OTP_MAX_WRONG = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_REQUESTS = 3; // per National ID per lockout window

export type ResetToken = { voterId: string; nationalId: string; jti: string; verified: boolean; issuedAt: number };

const secret = () => process.env.JWT_SECRET ?? "";

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const hmacOtp = (otp: string, voterId: string, jti: string) => createHmac("sha256", secret()).update(`${voterId}:${jti}:${otp}`).digest("hex");

export const pinFingerprint = (pinHash: string) => createHash("sha256").update(pinHash).digest("hex").slice(0, 16);

export function otpMatches(otp: string, voterId: string, jti: string, expected: string): boolean {
  const a = Buffer.from(hmacOtp(otp, voterId, jti));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function signResetToken(p: { voterId: string; nationalId: string; otp?: string; jti?: string; pinHash: string; verified: boolean; minutes?: number }) {
  const jti = p.jti ?? randomUUID();
  return new SignJWT({
    typ: "pin_reset",
    nid: p.nationalId,
    pf: pinFingerprint(p.pinHash),
    v: p.verified,
    ...(p.otp ? { otp: hmacOtp(p.otp, p.voterId, jti) } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.voterId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${p.minutes ?? OTP_MINUTES}m`)
    .sign(config.jwtSecret);
}

/** Reads and validates the reset cookie, including the single-use fingerprint check. */
export async function readResetToken(): Promise<(ResetToken & { otpHash?: string; pinHash: string }) | null> {
  const token = (await cookies()).get(PIN_RESET_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (payload.typ !== "pin_reset" || !payload.sub || !payload.jti || typeof payload.nid !== "string") return null;
    const voter = await prisma.voter.findUnique({ where: { id: payload.sub }, select: { pinHash: true } });
    if (!voter || pinFingerprint(voter.pinHash) !== payload.pf) return null; // PIN already changed → token spent
    return {
      voterId: payload.sub,
      nationalId: payload.nid,
      jti: payload.jti,
      verified: payload.v === true,
      issuedAt: (payload.iat ?? 0) * 1000,
      otpHash: typeof payload.otp === "string" ? payload.otp : undefined,
      pinHash: voter.pinHash,
    };
  } catch {
    return null;
  }
}

/** Wrong codes entered against this particular reset request. */
export async function wrongCodesSince(nationalId: string, since: number) {
  return prisma.verificationAttempt.count({
    where: { identifier: nationalId, stage: "otp", reason: "wrong_otp", createdAt: { gte: new Date(since) } },
  });
}

/** Throttling for "send me a code". */
export async function requestThrottle(nationalId: string) {
  const since = new Date(Date.now() - config.lockoutMinutes * 60_000);
  const recent = await prisma.verificationAttempt.findMany({
    where: { identifier: nationalId, stage: "otp_request", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const waitSeconds = recent[0] ? Math.max(0, Math.ceil(OTP_RESEND_SECONDS - (Date.now() - recent[0].createdAt.getTime()) / 1000)) : 0;
  return { count: recent.length, waitSeconds };
}
