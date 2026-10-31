import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getProject } from "@/lib/edge-impulse-api";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import DatasetCollector from "./DatasetCollector";

export const metadata = { title: "Data collection" };

export default async function DatasetPage() {
  const ei = await getProject();

  return (
    <>
      <PageHeader
        title="Data collection"
        description="Capture training images for the face detector and send them straight to your Edge Impulse project, already labelled."
        actions={
          ei.ok ? (
            <a href={ei.project.studioUrl} target="_blank" rel="noreferrer" className="btn-secondary">
              Open “{ei.project.name}” in Edge Impulse <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : undefined
        }
      />

      {!ei.ok && (
        <Alert kind="warning">
          <p className="font-semibold">Edge Impulse is not connected: {ei.error}</p>
          <p className="mt-0.5">
            Add <code>EDGE_IMPULSE_API_KEY</code> to <code>.env</code> (Edge Impulse Studio → your project → Dashboard → Keys), restart the server, and check{" "}
            <Link href="/admin/integrations" className="underline">
              Integrations
            </Link>
            .
          </p>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Consent", "Each volunteer signs the data-collection consent form and gets an anonymous code (VOL-01…)."],
          ["2", "Capture", "Vary lighting, angle, distance, glasses and background. Add 30–50 background shots with no people."],
          ["3", "Train", "In Edge Impulse, review the boxes in the labelling queue, then train FOMO and export WebAssembly."],
        ].map(([n, t, d]) => (
          <Card key={n} className="space-y-1 p-5">
            <Badge tone="primary">Step {n}</Badge>
            <p className="pt-2 font-semibold">{t}</p>
            <p className="text-sm text-muted">{d}</p>
          </Card>
        ))}
      </div>

      <Card>
        <DatasetCollector />
      </Card>
    </>
  );
}
