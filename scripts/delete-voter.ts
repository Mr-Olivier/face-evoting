// Deletes ONE voter who has not voted, plus their verification attempts and email log entries.
// `npx tsx --env-file=.env scripts/delete-voter.ts FV-983574`
import { prisma } from "../src/lib/prisma";
import { maskEmail } from "../src/lib/rwanda";

(async () => {
  const voterNumber = process.argv[2];
  const v = await prisma.voter.findUnique({ where: { voterNumber }, include: { _count: { select: { participations: true } } } });
  if (!v) {
    console.log(`No voter ${voterNumber}.`);
    return prisma.$disconnect();
  }
  if (v._count.participations > 0) {
    console.log(`${voterNumber} has already voted. Deleting them would break the ballots = participants check, so nothing was deleted.`);
    return prisma.$disconnect();
  }
  const [attempts, emails, voter] = await prisma.$transaction([
    prisma.verificationAttempt.deleteMany({ where: { OR: [{ voterId: v.id }, { identifier: v.nationalId }] } }),
    prisma.emailLog.deleteMany({ where: v.email ? { toMasked: maskEmail(v.email) } : { id: "__none__" } }),
    prisma.voter.delete({ where: { id: v.id } }),
  ]);
  console.log(`Deleted voter ${voter.voterNumber} (${voter.firstName} ${voter.lastName}), ${attempts.count} verification attempts, ${emails.count} email log entries.`);
  await prisma.$disconnect();
})();
