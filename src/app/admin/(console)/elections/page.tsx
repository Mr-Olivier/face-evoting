import { Landmark, ShieldCheck } from "lucide-react";
import { getElectionResults } from "@/lib/results";
import { Badge, Card, EmptyState, PageHeader, electionTone } from "@/components/ui";
import ResultsBars from "../ResultsBars";
import { AddCandidateForm, CreateElectionForm, ElectionStatusButtons } from "../ElectionControls";

export const metadata = { title: "Elections" };

export default async function ElectionsPage() {
  const elections = await getElectionResults();

  return (
    <>
      <PageHeader title="Elections" description="Create elections, manage candidates and open or close voting. Only one election can be open at a time." />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {elections.length === 0 && (
            <Card>
              <EmptyState Icon={Landmark} title="No elections yet">Create your first election using the form.</EmptyState>
            </Card>
          )}
          {elections.map((e) => {
            const turnout = e.eligibleVoters ? Math.round((e.participants / e.eligibleVoters) * 100) : 0;
            return (
              <Card key={e.id} className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Badge tone={electionTone[e.status]} dot>
                      {e.status}
                    </Badge>
                    <h2 className="mt-2 text-lg font-bold">{e.title}</h2>
                    {e.description && <p className="text-sm text-muted">{e.description}</p>}
                    <p className="mt-1 text-sm text-subtle">
                      {e.candidates.length} candidates · {e.totalBallots} ballots · {turnout}% turnout
                    </p>
                  </div>
                  <ElectionStatusButtons id={e.id} status={e.status} />
                </div>

                <ResultsBars election={e} />

                <p className={`flex items-center gap-2 text-xs ${e.totalBallots === e.participants ? "text-success" : "text-danger"}`}>
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Integrity: {e.totalBallots} ballots / {e.participants} participants
                </p>

                {e.status !== "CLOSED" && <AddCandidateForm electionId={e.id} />}
              </Card>
            );
          })}
        </div>

        <Card className="space-y-4 xl:sticky xl:top-8">
          <h2 className="font-semibold">New election</h2>
          <CreateElectionForm />
        </Card>
      </div>
    </>
  );
}
