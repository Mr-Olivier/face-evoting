/**
 * Seeds a demo election with 3 candidates.
 * Voters are NOT seeded — they must be enrolled with a real face capture at /admin/voters.
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.election.findFirst({ where: { title: "Student Council Election 2026" } });
  if (existing) {
    console.log("Seed already applied — skipping.");
    return;
  }

  const election = await prisma.election.create({
    data: {
      title: "Student Council Election 2026",
      description: "Demo election for the Face Recognition-Based E-Voting prototype.",
      status: "OPEN",
      candidates: {
        create: [
          { name: "Amina Uwase", party: "Progress Alliance", bio: "Better study spaces and longer library hours.", photoUrl: "/candidates/candidate-1.svg" },
          { name: "David Mensah", party: "Unity Party", bio: "More student clubs and stronger industry links.", photoUrl: "/candidates/candidate-2.svg" },
          { name: "Grace Nkosi", party: "Future First", bio: "Mental-health support and affordable campus meals.", photoUrl: "/candidates/candidate-3.svg" },
        ],
      },
    },
    include: { candidates: true },
  });

  console.log(`Created election "${election.title}" with ${election.candidates.length} candidates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
