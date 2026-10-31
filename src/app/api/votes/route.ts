import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { castVoteSchema } from "@/lib/validation";
import { apiError, readJson, zodError } from "@/lib/api";
import { VOTER_COOKIE, getVoterSession } from "@/lib/auth";
import { newReceiptCode } from "@/lib/receipt";
import { emailConfig, sendEmail } from "@/lib/email/mailer";
import { voteConfirmationEmail } from "@/lib/email/templates";
import { formatKigali, maskEmail } from "@/lib/rwanda";

/**
 * POST /api/votes   Body: { candidateId }
 * Step 3 of 3. Requires the voter session cookie from /api/voters/verify.
 * Participation + Ballot are written in ONE transaction; the unique
 * (voterId, electionId) constraint makes double voting impossible,
 * even with two simultaneous requests. A confirmation email (without the
 * choice) is sent after the response.
 */
export async function POST(req: Request) {
  const session = await getVoterSession();
  if (!session)
    return apiError("SESSION_EXPIRED", 401, "Your voting session has expired.", {
      hint: "For your security, ballots must be cast within 5 minutes of the face check. Please verify again.",
    });

  const parsed = castVoteSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  const [election, candidate, voter] = await Promise.all([
    prisma.election.findUnique({ where: { id: session.electionId } }),
    prisma.candidate.findUnique({ where: { id: parsed.data.candidateId } }),
    prisma.voter.findUnique({ where: { id: session.voterId } }),
  ]);
  if (!election || election.status !== "OPEN") return apiError("NO_OPEN_ELECTION", 409, "This election is no longer open.", { hint: "Voting closed before your ballot was submitted." });
  if (!candidate || candidate.electionId !== election.id) return apiError("INVALID_CANDIDATE", 400, "That candidate is not on this ballot.", { hint: "Go back and select a candidate from the list." });
  if (!voter || !voter.isEligible) return apiError("NOT_ELIGIBLE", 403, "Your registration is not active.");

  const receiptCode = newReceiptCode();
  let votedAt: Date;
  try {
    const [participation] = await prisma.$transaction([
      prisma.participation.create({ data: { voterId: voter.id, electionId: election.id, receiptCode } }),
      prisma.ballot.create({ data: { electionId: election.id, candidateId: candidate.id } }),
    ]);
    votedAt = participation.votedAt;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const res = apiError("ALREADY_VOTED", 409, "You have already voted in this election.", { hint: "Only one ballot per voter is accepted." });
      res.cookies.delete(VOTER_COOKIE);
      return res;
    }
    throw e;
  }

  const willEmail = Boolean(voter.email && emailConfig().configured);
  if (voter.email) {
    const email = voter.email;
    const mail = voteConfirmationEmail({ firstName: voter.firstName, electionTitle: election.title, receiptCode, votedAt: formatKigali(votedAt) });
    after(() => sendEmail({ type: "vote_confirmation", to: email, toName: `${voter.firstName} ${voter.lastName}`, ...mail }).then(() => undefined));
  }

  const res = NextResponse.json({
    ok: true,
    message: "Your vote has been recorded.",
    receipt: {
      code: receiptCode,
      votedAt: formatKigali(votedAt),
      electionTitle: election.title,
      emailedTo: willEmail && voter.email ? maskEmail(voter.email) : null,
    },
  });
  res.cookies.delete(VOTER_COOKIE); // session is single-use
  return res;
}
