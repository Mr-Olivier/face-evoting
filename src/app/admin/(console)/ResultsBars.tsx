import type { ElectionResult } from "@/lib/results";
import { Avatar } from "@/components/ui";

/** Horizontal results bars — one series, so a single hue; the leader is marked in text. */
export default function ResultsBars({ election }: { election: ElectionResult }) {
  const max = Math.max(1, ...election.candidates.map((c) => c.votes));
  const leader = election.totalBallots > 0 ? [...election.candidates].sort((a, b) => b.votes - a.votes)[0] : null;
  const sorted = [...election.candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  if (election.candidates.length === 0) return <p className="text-sm text-muted">No candidates yet.</p>;

  return (
    <ul className="space-y-4">
      {sorted.map((c) => {
        const pct = election.totalBallots ? Math.round((c.votes / election.totalBallots) * 100) : 0;
        return (
          <li key={c.id} title={`${c.name}: ${c.votes} vote${c.votes === 1 ? "" : "s"} (${pct}%)`}>
            <div className="flex items-center gap-3">
              <Avatar name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {c.name}
                    {c.party && <span className="ml-1.5 text-subtle">{c.party}</span>}
                    {leader?.id === c.id && <span className="ml-2 text-xs font-semibold text-success">Leading</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    <span className="font-semibold text-text">{c.votes}</span> · {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-surface-2">
                  <div className="h-2.5 rounded-full bg-series-1 transition-all" style={{ width: `${(c.votes / max) * 100}%` }} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
