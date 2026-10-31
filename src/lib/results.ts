import { prisma } from "./prisma";

export async function getElectionResults() {
  const [elections, tallies, totalVoters] = await Promise.all([
    prisma.election.findMany({
      orderBy: { createdAt: "desc" },
      include: { candidates: { orderBy: { name: "asc" } }, _count: { select: { participations: true, ballots: true } } },
    }),
    prisma.ballot.groupBy({ by: ["candidateId"], _count: { _all: true } }),
    prisma.voter.count({ where: { isEligible: true } }),
  ]);
  const votesByCandidate = new Map(tallies.map((t) => [t.candidateId, t._count._all]));

  return elections.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    status: e.status,
    totalBallots: e._count.ballots,
    participants: e._count.participations,
    eligibleVoters: totalVoters,
    candidates: e.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      party: c.party,
      votes: votesByCandidate.get(c.id) ?? 0,
    })),
  }));
}

export type ElectionResult = Awaited<ReturnType<typeof getElectionResults>>[number];
