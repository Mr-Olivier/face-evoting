// Builds and sends a voter's emails from their database record (used at registration and for resends).
import { prisma } from "../prisma";
import { formatKigali, maskEmail, maskNationalId } from "../rwanda";
import { sendEmail, type SendResult } from "./mailer";
import { registrationEmail, voteConfirmationEmail } from "./templates";

export type VoterEmailKind = "registration" | "vote_confirmation";
export type VoterEmailResult = SendResult & { to?: string };

export async function sendVoterEmail(voterId: string, kind: VoterEmailKind): Promise<VoterEmailResult | { status: "NO_EMAIL" } | { status: "NOT_FOUND" } | { status: "NOT_VOTED" }> {
  const voter = await prisma.voter.findUnique({ where: { id: voterId } });
  if (!voter) return { status: "NOT_FOUND" };
  if (!voter.email) return { status: "NO_EMAIL" };
  const name = `${voter.firstName} ${voter.lastName}`;

  if (kind === "registration") {
    const mail = registrationEmail({
      firstName: voter.firstName,
      fullName: name,
      voterNumber: voter.voterNumber,
      maskedNationalId: maskNationalId(voter.nationalId),
      address: { village: voter.village, cell: voter.cell, sector: voter.sector, district: voter.district, province: voter.province },
      registeredAt: formatKigali(voter.createdAt),
    });
    const r = await sendEmail({ type: "registration", to: voter.email, toName: name, ...mail });
    return { ...r, to: maskEmail(voter.email) };
  }

  const participation = await prisma.participation.findFirst({ where: { voterId }, orderBy: { votedAt: "desc" }, include: { election: true } });
  if (!participation) return { status: "NOT_VOTED" };
  const mail = voteConfirmationEmail({
    firstName: voter.firstName,
    electionTitle: participation.election.title,
    receiptCode: participation.receiptCode,
    votedAt: formatKigali(participation.votedAt),
  });
  const r = await sendEmail({ type: "vote_confirmation", to: voter.email, toName: name, ...mail });
  return { ...r, to: maskEmail(voter.email) };
}
