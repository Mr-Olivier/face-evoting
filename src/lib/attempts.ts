// Verification attempt log + lockout rules (server only).
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { config } from "./config";

/** credentials/face = identity checks; otp_request/otp = PIN reset by email code. */
export type Stage = "credentials" | "face" | "otp_request" | "otp";

/** Salted hash of the client IP — enough to rate-limit, useless for tracking people. */
export function clientIpHash(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${process.env.JWT_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

const windowStart = () => new Date(Date.now() - config.lockoutMinutes * 60_000);

export type LockState = { locked: boolean; retryInMinutes: number; remaining: number; ipBlocked: boolean };

export async function lockState(identifier: string, ipHash: string): Promise<LockState> {
  const since = windowStart();
  const [recent, ipFailures] = await Promise.all([
    prisma.verificationAttempt.findMany({
      where: { identifier, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: config.maxFailedAttempts,
      select: { createdAt: true },
    }),
    prisma.verificationAttempt.count({ where: { ipHash, success: false, createdAt: { gte: since } } }),
  ]);
  const locked = recent.length >= config.maxFailedAttempts;
  // The lock lifts when the oldest of the last N failures leaves the window.
  const unlockAt = locked ? recent[recent.length - 1].createdAt.getTime() + config.lockoutMinutes * 60_000 : 0;
  return {
    locked,
    retryInMinutes: locked ? Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000)) : 0,
    remaining: Math.max(0, config.maxFailedAttempts - recent.length),
    ipBlocked: ipFailures >= config.maxFailedPerIp,
  };
}

export async function recordAttempt(data: {
  identifier: string;
  stage: Stage;
  success: boolean;
  reason?: string;
  voterId?: string | null;
  distance?: number;
  ipHash: string;
}) {
  await prisma.verificationAttempt.create({
    data: {
      identifier: data.identifier,
      stage: data.stage,
      success: data.success,
      reason: data.reason,
      voterId: data.voterId ?? undefined,
      distance: data.distance,
      ipHash: data.ipHash,
    },
  });
}

/** "You have 2 attempts left before a 15-minute lock." */
export function attemptsLeftHint(remainingAfterThisFailure: number): string {
  if (remainingAfterThisFailure <= 0) return `This National ID is now locked for ${config.lockoutMinutes} minutes.`;
  return `You have ${remainingAfterThisFailure} attempt${remainingAfterThisFailure === 1 ? "" : "s"} left before a ${config.lockoutMinutes}-minute lock.`;
}
