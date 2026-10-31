import { Brain, Cpu, Database, FileText, Gauge } from "lucide-react";
import { config } from "@/lib/config";
import { getModelCard, getModelStatus } from "@/lib/model-card";
import { Alert, Badge, Card, PageHeader, StatCard } from "@/components/ui";
import ModelLab from "./ModelLab";

export const metadata = { title: "AI model" };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function ModelPage() {
  const [card, status] = await Promise.all([getModelCard(), getModelStatus()]);

  return (
    <>
      <PageHeader
        title="AI model"
        description="The Edge Impulse face detector that runs in the voter's browser, its training results, and a live test bench."
        actions={
          <Badge tone={status.mode === "edge-impulse" ? "success" : status.mode === "demo" ? "warning" : "neutral"} dot>
            {status.mode === "edge-impulse"
              ? "Trained Edge Impulse model active"
              : status.mode === "demo"
                ? "Demo model active"
                : "face-api fallback active"}
          </Badge>
        }
      />

      {status.mode === "demo" && (
        <Alert kind="warning">
          No Edge Impulse export found in <code>public/models/edge-impulse/</code>, so the demo model is running. It returns the same output as
          the real export, so the whole voting flow works. Follow <code>docs/MODEL_TRAINING.md</code> to train and drop in your own model.
        </Alert>
      )}

      {card ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="F1 score" value={card.metrics.f1.toFixed(2)} Icon={Gauge} hint="Validation set" />
            <StatCard label="Test accuracy" value={pct(card.metrics.testAccuracy)} Icon={Gauge} hint={`${card.dataset.testImages} unseen images`} />
            <StatCard label="Inference time" value={`${card.onDevice.inferenceMs} ms`} Icon={Cpu} hint={card.onDevice.target} />
            <StatCard label="Training images" value={card.dataset.totalImages} Icon={Database} hint={`${card.dataset.volunteers} consenting volunteers`} />
          </div>
          {card.isSample && (
            <p className="-mt-4 text-xs text-warning">
              These are sample values from <code>model-card.json</code>. Replace them with your own Edge Impulse results after training.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="space-y-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Brain className="h-4 w-4 text-primary" aria-hidden /> Model
              </h2>
              <dl className="space-y-2.5 text-sm">
                {[
                  ["Name", `${card.name} ${card.version}`],
                  ["Project", card.edgeImpulseProject],
                  ["Task", card.task],
                  ["Architecture", card.architecture],
                  ["Labels", card.labels.join(", ")],
                  ["Input", `${card.input.width}×${card.input.height} · ${card.input.colorDepth} · ${card.input.resizeMode}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="space-y-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4 text-primary" aria-hidden /> Dataset & training
              </h2>
              <dl className="space-y-2.5 text-sm">
                {[
                  ["Face images", card.dataset.faceImages],
                  ["Background (no face)", card.dataset.backgroundImages],
                  ["Bounding boxes", card.dataset.boundingBoxes],
                  ["Train / test split", `${card.dataset.trainImages} / ${card.dataset.testImages}`],
                  ["Training cycles", card.training.cycles],
                  ["Learning rate", card.training.learningRate],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="space-y-4">
              <h2 className="font-semibold">Confusion matrix (%)</h2>
              <table className="w-full table-fixed text-center text-sm">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="pb-2 text-left font-medium">actual ↓ / predicted →</th>
                    {card.confusionMatrix.labels.map((l) => (
                      <th key={l} className="pb-2 font-semibold">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {card.confusionMatrix.rows.map((row, i) => (
                    <tr key={i}>
                      <th className="py-1 text-left text-xs font-semibold text-muted">{card.confusionMatrix.labels[i]}</th>
                      {row.map((v, j) => (
                        <td key={j} className="p-1">
                          <div className={`rounded-lg py-3 font-mono font-semibold ${i === j ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"}`}>
                            {v.toFixed(1)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="font-mono text-base font-bold text-text">{card.metrics.precision.toFixed(2)}</p>
                  <p className="text-muted">Precision</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="font-mono text-base font-bold text-text">{card.metrics.recall.toFixed(2)}</p>
                  <p className="text-muted">Recall</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Alert kind="error">model-card.json is missing from public/models/edge-impulse/.</Alert>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Live test bench</h2>
          <p className="text-sm text-muted">Check detection, confidence and blink detection, and measure face distances.</p>
        </div>
        <ModelLab threshold={config.faceMatchThreshold} />
      </Card>
    </>
  );
}
