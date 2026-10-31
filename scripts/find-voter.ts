// Finds voters by name (read-only): `npx tsx --env-file=.env scripts/find-voter.ts olivier`
import { prisma } from "../src/lib/prisma";
import { maskEmail, maskNationalId } from "../src/lib/rwanda";

(async () => {
  const q = process.argv[2] ?? "";
  const voters = await prisma.voter.findMany({
    where: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] },
    orderBy: { createdAt: "desc" },
  });
  for (const v of voters) {
    console.log(
      `${v.voterNumber} · ${v.firstName} ${v.lastName} · ID ${maskNationalId(v.nationalId)} · ${v.email ? maskEmail(v.email) : "no email"} · ` +
        `face signature: ${v.faceDescriptor.length} numbers · eligible: ${v.isEligible} · registered ${v.createdAt.toISOString()}`,
    );
  }
  if (!voters.length) console.log(`No voter matching "${q}".`);
  await prisma.$disconnect();
})();
