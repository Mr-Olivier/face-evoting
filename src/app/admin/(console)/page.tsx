import Link from "next/link";
import { Activity, ArrowRight, Brain, ChartColumn, ShieldCheck, UserCheck, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getElectionResults } from "@/lib/results";
import { getModelCard, getModelStatus } from "@/lib/model-card";
import { Badge, Card, EmptyState, PageHeader, StatCard, electionTone } from "@/components/ui";
import ResultsBars from "./ResultsBars";
import { ElectionStatusButtons } from "./ElectionControls";
import { AttemptsTable, IDENTITY_STAGES, attemptInclude } from "./activity/AttemptsTable";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [elections, voterCount, attempts24, success24, recent, card, model] = await Promise.all([
    getElectionResults(),
    prisma.voter.count(),
    prisma.verificationAttempt.count({ where: { createdAt: { gte: since }, stage: { in: IDENTITY_STAGES } } }),
    prisma.verificationAttempt.count({ where: { createdAt: { gte: since }, success: true, stage: { in: IDENTITY_STAGES } } }),
    prisma.verificationAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: attemptInclude }),
    getModelCard(),
    getModelStatus(),
  ]);

  const active = elections.find((e) => e.status === "OPEN") ?? elections[0];
  const turnout = active?.eligibleVoters ? Math.round((active.participants / active.eligibleVoters) * 100) : 0;
  const successRate = attempts24 ? Math.round((success24 / attempts24) * 100) : null;

  return (
    <>
      <PageHeader title="Overview" description="Live status of the election, voters and identity verification." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered voters" value={voterCount} hint={`${active?.eligibleVoters ?? 0} eligible`} Icon={Users} />
        <StatCard label="Ballots cast" value={active?.totalBallots ?? 0} hint={active ? active.title : "No election"} Icon={ChartColumn} />
        <StatCard label="Turnout" value={`${turnout}%`} hint={`${active?.participants ?? 0} of ${active?.eligibleVoters ?? 0} eligible voters`} Icon={UserCheck} />
        <StatCard
          label="Verification success (24h)"
          value={successRate === null ? "—" : `${successRate}%`}
          hint={`${success24} of ${attempts24} attempts`}
          Icon={ShieldCheck}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="space-y-6">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge tone={electionTone[active.status]} dot>
                    {active.status}
                  </Badge>
                  <h2 className="mt-2 text-lg font-bold">{active.title}</h2>
                  <p className="text-sm text-muted">
                    {active.totalBallots} ballots · {turnout}% turnout
                  </p>
                </div>
                <ElectionStatusButtons id={active.id} status={active.status} />
              </div>
              <ResultsBars election={active} />
              <div
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                  active.totalBallots === active.participants ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {active.totalBallots === active.participants
                  ? `Integrity check passed: ${active.totalBallots} ballots = ${active.participants} participants`
                  : `Integrity check FAILED: ${active.totalBallots} ballots ≠ ${active.participants} participants`}
              </div>
            </>
          ) : (
            <EmptyState Icon={ChartColumn} title="No elections yet">
              Create one on the <Link href="/admin/elections" className="text-primary underline">Elections</Link> page or run <code>npm run db:seed</code>.
            </EmptyState>
          )}
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Brain className="h-4 w-4 text-primary" aria-hidden /> Face detection model
            </h2>
            <Badge tone={model.mode === "edge-impulse" ? "success" : model.mode === "demo" ? "warning" : "neutral"} dot>
              {model.mode === "edge-impulse" ? "Trained model" : model.mode === "demo" ? "Demo model" : "Fallback"}
            </Badge>
          </div>
          {card && (
            <>
              <div>
                <p className="font-semibold">
                  {card.name} <span className="text-subtle">{card.version}</span>
                </p>
                <p className="text-sm text-muted">{card.architecture}</p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["F1 score", card.metrics.f1.toFixed(2)],
                  ["Precision", card.metrics.precision.toFixed(2)],
                  ["Recall", card.metrics.recall.toFixed(2)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface-2 p-3">
                    <dd className="text-xl font-bold tabular-nums">{v}</dd>
                    <dt className="text-xs text-muted">{k}</dt>
                  </div>
                ))}
              </dl>
              {card.isSample && <p className="text-xs text-warning">Sample metrics. Replace them with your Edge Impulse results after training.</p>}
            </>
          )}
          <Link href="/admin/model" className="btn-secondary w-full">
            Open model lab <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Activity className="h-4 w-4 text-primary" aria-hidden /> Recent verification attempts
          </h2>
          <Link href="/admin/activity" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <AttemptsTable attempts={recent} />
      </Card>
    </>
  );
}
