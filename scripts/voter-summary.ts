// Shows what is stored for one voter (read-only): `npx tsx --env-file=.env scripts/voter-summary.ts FV-983574`
import { prisma } from "../src/lib/prisma";
import { maskEmail, maskNationalId } from "../src/lib/rwanda";

(async () => {
  const voterNumber = process.argv[2];
  const v = await prisma.voter.findUnique({ where: { voterNumber }, include: { participations: { include: { election: { select: { title: true, status: true } } } } } });
  if (!v) {
    console.log(`No voter ${voterNumber}.`);
    return prisma.$disconnect();
  }
  const attempts = await prisma.verificationAttempt.count({ where: { OR: [{ voterId: v.id }, { identifier: v.nationalId }] } });
  console.log(`${v.voterNumber} · ${v.firstName} ${v.lastName} · ID ${maskNationalId(v.nationalId)} · ${v.email ? maskEmail(v.email) : "no email"}`);
  console.log(`registered ${v.createdAt.toISOString()} · verification attempts: ${attempts}`);
  console.log(`participations: ${v.participations.length}${v.participations.map((p) => ` [${p.election.title} (${p.election.status}) ref ${p.receiptCode}]`).join("")}`);
  await prisma.$disconnect();
})();
