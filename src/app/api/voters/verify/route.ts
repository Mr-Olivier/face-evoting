import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { isMatch } from "@/lib/face-match";
import { verifyFaceSchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { PREAUTH_COOKIE, VOTER_COOKIE, cookieOptions, getPreauth, signVoterSession } from "@/lib/auth";
import { attemptsLeftHint, clientIpHash, lockState, recordAttempt } from "@/lib/attempts";

/**
 * POST /api/voters/verify   Body: { descriptor: number[128], livenessPassed }
 *
 * Step 2 of 3. Requires the pre-auth cookie from /api/voters/lookup.
 * 1:1 verification: the live face must match THIS voter's enrolled face.
 * On success a short-lived session cookie allows exactly one ballot.
 */
export async function POST(req: Request) {
  const pre = await getPreauth();
  if (!pre)
    return apiError("SESSION_EXPIRED", 401, "Your identity check has expired.", {
      hint: `For your security you have ${config.preauthMinutes} minutes to complete the face check. Enter your National ID and PIN again.`,
    });

  const parsed = verifyFaceSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const { descriptor, livenessPassed } = parsed.data;
  const ipHash = clientIpHash(req);

  const [election, voter] = await Promise.all([
    prisma.election.findUnique({ where: { id: pre.electionId } }),
    prisma.voter.findUnique({ where: { id: pre.voterId } }),
  ]);
  if (!election || election.status !== "OPEN") return apiError("NO_OPEN_ELECTION", 409, "Voting has closed.", { hint: "The election is no longer accepting votes." });
  if (!voter || !voter.isEligible) return apiError("NOT_ELIGIBLE", 403, "Your registration is not active.", { hint: `Contact ${config.electionOffice}.` });

  const lock = await lockState(voter.nationalId, ipHash);
  if (lock.locked) {
    const res = apiError("LOCKED", 429, "This National ID is temporarily locked after too many failed attempts.", {
      hint: `Try again in ${lock.retryInMinutes} minutes, or visit ${config.electionOffice} with your ID card.`,
    });
    res.cookies.delete(PREAUTH_COOKIE);
    return res;
  }

  const base = { identifier: voter.nationalId, stage: "face" as const, voterId: voter.id, ipHash };

  if (!livenessPassed) {
    await recordAttempt({ ...base, success: false, reason: "liveness" });
    return apiError("LIVENESS_FAILED", 400, "We couldn't confirm a live person.", { hint: "Look straight at the camera and blink slowly once when asked." });
  }

  const { match, distance } = isMatch(descriptor, voter.faceDescriptor);
  if (!match) {
    await recordAttempt({ ...base, success: false, reason: "face_mismatch", distance });
    const remaining = lock.remaining - 1;
    const res = apiError("FACE_MISMATCH", 401, "Your face doesn't match the face registered for this National ID.", {
      hint:
        remaining > 0
          ? `Face the light, remove sunglasses or a cap, and keep your face inside the oval. ${attemptsLeftHint(remaining)}`
          : attemptsLeftHint(0),
      remaining,
    });
    if (remaining <= 0) res.cookies.delete(PREAUTH_COOKIE);
    return res;
  }

  const already = await prisma.participation.findUnique({
    where: { voterId_electionId: { voterId: voter.id, electionId: election.id } },
  });
  if (already) return apiError("ALREADY_VOTED", 409, "You have already voted in this election.", { hint: `Reference: ${already.receiptCode}.` });

  await recordAttempt({ ...base, success: true, distance });

  const res = NextResponse.json({ ok: true, verified: true, expiresInSeconds: config.voterSessionMinutes * 60 });
  res.cookies.delete(PREAUTH_COOKIE);
  res.cookies.set(VOTER_COOKIE, await signVoterSession({ voterId: voter.id, electionId: election.id }), cookieOptions(config.voterSessionMinutes * 60));
  return res;
}
