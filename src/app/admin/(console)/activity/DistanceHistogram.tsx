/**
 * Histogram of face distances: genuine voters (verified) vs impostors (face mismatch).
 * Two series → validated categorical slots 1 & 2, with a legend and a threshold marker.
 */
const BIN = 0.05;
const MAX = 1.0;
const BINS = Math.round(MAX / BIN);

function bin(values: number[]) {
  const counts = new Array(BINS).fill(0);
  for (const v of values) counts[Math.min(BINS - 1, Math.max(0, Math.floor(v / BIN)))]++;
  return counts;
}

export default function DistanceHistogram({ genuine, impostor, threshold }: { genuine: number[]; impostor: number[]; threshold: number }) {
  const g = bin(genuine);
  const im = bin(impostor);
  const peak = Math.max(1, ...g, ...im);
  const thresholdPct = (Math.min(threshold, MAX) / MAX) * 100;

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-series-1" /> Genuine (verified) · {genuine.length}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-series-2" /> Impostor (face mismatch) · {impostor.length}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0 border-l-2 border-dashed border-text" /> Threshold {threshold.toFixed(2)}
        </span>
      </div>

      <div className="relative h-48 border-b border-border">
        {/* recessive grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-border/60" style={{ bottom: `${f * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end">
          {g.map((gc, i) => {
            const lo = (i * BIN).toFixed(2);
            const hi = ((i + 1) * BIN).toFixed(2);
            return (
              <div key={i} className="flex h-full flex-1 items-end justify-center gap-[2px] px-[1px]">
                <div
                  className="w-full max-w-3 rounded-t-[4px] bg-series-1"
                  style={{ height: `${(gc / peak) * 100}%` }}
                  title={`Genuine ${lo}–${hi}: ${gc}`}
                />
                <div
                  className="w-full max-w-3 rounded-t-[4px] bg-series-2"
                  style={{ height: `${(im[i] / peak) * 100}%` }}
                  title={`Impostor ${lo}–${hi}: ${im[i]}`}
                />
              </div>
            );
          })}
        </div>
        <div className="absolute inset-y-0 border-l-2 border-dashed border-text" style={{ left: `${thresholdPct}%` }}>
          <span className="absolute -top-1 left-1.5 whitespace-nowrap rounded bg-surface px-1 text-[11px] font-semibold text-text">accept ←  → reject</span>
        </div>
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-subtle">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span key={t}>{t.toFixed(2)}</span>
        ))}
      </div>
      <figcaption className="text-xs text-subtle">
        Face distance (lower = more similar). A good threshold sits in the gap between the two groups.
      </figcaption>
    </figure>
  );
}
