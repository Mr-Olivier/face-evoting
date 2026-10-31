import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { voterLookupSchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { PREAUTH_COOKIE, cookieOptions, signPreauth } from "@/lib/auth";
import { attemptsLeftHint, clientIpHash, lockState, recordAttempt } from "@/lib/attempts";
import { formatKigali, maskEmail, maskNationalId, maskPhone } from "@/lib/rwanda";

/**
 * POST /api/voters/lookup   Body: { nationalId, pin }
 *
 * Step 1 of 3. Checks the National ID + PIN and returns the voter's registered
 * details so they can confirm "this is me" before the face check. Personal
 * details are only ever returned AFTER the PIN is verified.
 *
 * Registration status alone ("not registered") is disclosed on purpose: voters
 * need to know whether they are on the register, as with SMS/USSD register checks.
 */
export async function POST(req: Request) {
  const parsed = voterLookupSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);
  const { nationalId, pin } = parsed.data;
  const ipHash = clientIpHash(req);

  const election = await prisma.election.findFirst({ where: { status: "OPEN" } });
  if (!election)
    return apiError("NO_OPEN_ELECTION", 409, "Voting is not open right now.", { hint: "Check the official election schedule and try again during voting hours." });

  const lock = await lockState(nationalId, ipHash);
  if (lock.ipBlocked)
    return apiError("TOO_MANY_REQUESTS", 429, "Too many failed attempts from this device.", {
      hint: `Wait ${config.lockoutMinutes} minutes before trying again, or ask an election officer for help.`,
    });
  if (lock.locked)
    return apiError("LOCKED", 429, "This National ID is temporarily locked after too many failed attempts.", {
      hint: `Try again in ${lock.retryInMinutes} minute${lock.retryInMinutes === 1 ? "" : "s"}, or visit ${config.electionOffice} with your ID card.`,
      retryInMinutes: lock.retryInMinutes,
    });

  const voter = await prisma.voter.findUnique({ where: { nationalId } });
  if (!voter) {
    await recordAttempt({ identifier: nationalId, stage: "credentials", success: false, reason: "not_registered", ipHash });
    return apiError("NOT_REGISTERED", 404, "No voter is registered with this National ID.", {
      hint: `Check the number on your ID card. If it is correct, you are not on the register. Visit ${config.electionOffice} to register.`,
      fieldErrors: { nationalId: "This National ID is not on the voter register." },
    });
  }

  if (!(await bcrypt.compare(pin, voter.pinHash))) {
    await recordAttempt({ identifier: nationalId, stage: "credentials", success: false, reason: "wrong_pin", voterId: voter.id, ipHash });
    return apiError("WRONG_PIN", 401, "The PIN is incorrect.", {
      hint: `${attemptsLeftHint(lock.remaining - 1)} Forgot your PIN? Use "Forgot your PIN?" to get a reset code by email.`,
      fieldErrors: { pin: "Incorrect PIN." },
    });
  }

  if (!voter.isEligible) {
    await recordAttempt({ identifier: nationalId, stage: "credentials", success: false, reason: "not_eligible", voterId: voter.id, ipHash });
    return apiError("NOT_ELIGIBLE", 403, "Your registration is currently suspended.", {
      hint: `Contact ${config.electionOffice} to find out why and how to restore it.`,
    });
  }
  if (voter.faceDescriptor.length !== config.descriptorLength) {
    return apiError("NO_BIOMETRICS", 409, "Your face has not been enrolled yet.", {
      hint: `Visit ${config.electionOffice} to complete your enrolment with an officer.`,
    });
  }

  const already = await prisma.participation.findUnique({
    where: { voterId_electionId: { voterId: voter.id, electionId: election.id } },
  });
  if (already) {
    await recordAttempt({ identifier: nationalId, stage: "credentials", success: false, reason: "already_voted", voterId: voter.id, ipHash });
    return apiError("ALREADY_VOTED", 409, `You already voted in this election on ${formatKigali(already.votedAt)}.`, {
      hint: `Your participation reference is ${already.receiptCode}. If you did not vote, contact ${config.electionOffice} immediately.`,
    });
  }

  const res = NextResponse.json({
    ok: true,
    election: { title: election.title },
    profile: {
      firstName: voter.firstName,
      lastName: voter.lastName,
      voterNumber: voter.voterNumber,
      nationalId: maskNationalId(voter.nationalId),
      dateOfBirth: formatKigali(voter.dateOfBirth, false),
      sex: voter.sex === "MALE" ? "Male" : "Female",
      address: { province: voter.province, district: voter.district, sector: voter.sector, cell: voter.cell, village: voter.village },
      phone: maskPhone(voter.phone),
      email: voter.email ? maskEmail(voter.email) : null,
    },
    expiresInSeconds: config.preauthMinutes * 60,
  });
  res.cookies.set(PREAUTH_COOKIE, await signPreauth({ voterId: voter.id, electionId: election.id }), cookieOptions(config.preauthMinutes * 60));
  return res;
}
