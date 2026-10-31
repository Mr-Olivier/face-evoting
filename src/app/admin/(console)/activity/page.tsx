import { Ban, ShieldCheck, Timer, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { AttemptsTable, IDENTITY_STAGES, REASON_LABELS, attemptInclude } from "./AttemptsTable";
import DistanceHistogram from "./DistanceHistogram";

export const metadata = { title: "Verification log" };

export default async function ActivityPage() {
  const [attempts, total, success, byReason, genuine, impostor] = await Promise.all([
    prisma.verificationAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: attemptInclude }),
    prisma.verificationAttempt.count({ where: { stage: { in: IDENTITY_STAGES } } }),
    prisma.verificationAttempt.count({ where: { success: true, stage: { in: IDENTITY_STAGES } } }),
    prisma.verificationAttempt.groupBy({ by: ["reason"], where: { success: false }, _count: { _all: true } }),
    prisma.verificationAttempt.findMany({ where: { success: true, distance: { not: null } }, select: { distance: true } }),
    prisma.verificationAttempt.findMany({ where: { reason: "face_mismatch", distance: { not: null } }, select: { distance: true } }),
  ]);

  const since = new Date(Date.now() - config.lockoutMinutes * 60_000);
  const locked = await prisma.verificationAttempt.groupBy({
    by: ["identifier"],
    where: { success: false, createdAt: { gte: since } },
    _count: { _all: true },
    having: { identifier: { _count: { gte: config.maxFailedAttempts } } },
  });
  const mismatches = byReason.find((r) => r.reason === "face_mismatch")?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Verification log"
        description="Every identity check (ID + PIN, face) and PIN-reset event, with face distances. Use it to tune the match threshold and report FAR / FRR."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total attempts" value={total} Icon={ShieldCheck} hint={`${success} verified`} />
        <StatCard label="Success rate" value={total ? `${Math.round((success / total) * 100)}%` : "—"} Icon={ShieldCheck} />
        <StatCard label="Face mismatches" value={mismatches} Icon={UserX} hint="Possible impostors rejected" />
        <StatCard label="Locked National IDs" value={locked.length} Icon={Timer} hint={`${config.maxFailedAttempts}+ failures in ${config.lockoutMinutes} min`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="space-y-4">
          <h2 className="font-semibold">Face distance distribution</h2>
          <DistanceHistogram
            genuine={genuine.map((a) => a.distance!)}
            impostor={impostor.map((a) => a.distance!)}
            threshold={config.faceMatchThreshold}
          />
        </Card>
        <Card className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Ban className="h-4 w-4 text-danger" aria-hidden /> Rejection reasons
          </h2>
          {byReason.length === 0 ? (
            <p className="text-sm text-muted">No rejected attempts yet.</p>
          ) : (
            <ul className="space-y-3">
              {byReason
                .sort((a, b) => b._count._all - a._count._all)
                .map((r) => (
                  <li key={r.reason ?? "unknown"} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{r.reason ? (REASON_LABELS[r.reason] ?? r.reason) : "Unknown"}</span>
                    <span className="font-semibold tabular-nums">{r._count._all}</span>
                  </li>
                ))}
            </ul>
          )}
          <p className="border-t border-border pt-4 text-xs text-subtle">
            Current threshold: <span className="font-mono font-semibold text-text">{config.faceMatchThreshold}</span> (set
            FACE_MATCH_THRESHOLD in .env).
          </p>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Latest 100 attempts</h2>
        <AttemptsTable attempts={attempts} />
      </Card>
    </>
  );
}
