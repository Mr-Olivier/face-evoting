import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getVoterSession } from "@/lib/auth";
import { Badge, Steps } from "@/components/ui";
import BallotForm from "./BallotForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ballot" };

export default async function VotePage() {
  const session = await getVoterSession();
  if (!session) redirect("/verify");

  const [election, voter] = await Promise.all([
    prisma.election.findUnique({ where: { id: session.electionId }, include: { candidates: { orderBy: { name: "asc" } } } }),
    prisma.voter.findUnique({ where: { id: session.voterId }, select: { firstName: true } }),
  ]);
  if (!election || election.status !== "OPEN") redirect("/");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-5">
        <Steps current={3} steps={["Identify", "Confirm details", "Face check", "Vote"]} />
        <div>
          <Badge tone="success" dot>
            Identity verified{voter ? ` · Welcome, ${voter.firstName}` : ""}
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{election.title}</h1>
          <p className="mt-1 text-muted">Select one candidate, then review and submit your ballot.</p>
        </div>
      </div>
      <BallotForm
        expiresAt={session.expiresAt ?? Date.now() + 5 * 60_000}
        candidates={election.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, bio: c.bio, photoUrl: c.photoUrl }))}
      />
    </div>
  );
}
