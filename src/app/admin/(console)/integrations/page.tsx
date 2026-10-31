import { Brain, CircleCheck, CircleX, ExternalLink, Mail, RotateCcw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { emailConfig, verifyEmail } from "@/lib/email/mailer";
import { getProject } from "@/lib/edge-impulse-api";
import { maskEmail } from "@/lib/rwanda";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import TestEmailForm from "./TestEmailForm";

export const metadata = { title: "Integrations" };

const statusTone = { SENT: "success", FAILED: "danger", SKIPPED: "warning" } as const;
const typeLabel: Record<string, string> = { registration: "Registration", vote_confirmation: "Vote confirmation", pin_reset_code: "PIN reset code", pin_changed: "PIN changed", test: "Test" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ recheck?: string }> }) {
  const recheck = (await searchParams).recheck === "1";
  const mail = emailConfig();
  const [ei, emails, mailCheck] = await Promise.all([
    getProject(recheck),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    verifyEmail(recheck),
  ]);
  const mailState = !mail.configured ? "missing" : mailCheck.ok ? "connected" : "failed";

  return (
    <>
      <PageHeader title="Integrations" description="External services FaceVote uses. Keys are read from .env on the server and never sent to browsers." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <Mail className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Email · {mail.provider === "gmail" ? "Gmail" : "Brevo"}</h2>
                <p className="text-sm text-muted">Registration and vote-confirmation emails</p>
              </div>
            </div>
            <Badge tone={mailState === "connected" ? "success" : mailState === "failed" ? "danger" : "warning"} dot>
              {mailState === "connected" ? "Connected" : mailState === "failed" ? "Login failed" : "Not configured"}
            </Badge>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Provider</dt>
              <dd className="font-medium">{mail.provider === "gmail" ? "Gmail SMTP (App Password)" : "Brevo API"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Sender</dt>
              <dd className="font-medium">{mail.senderEmail ? `${mail.senderName} <${maskEmail(mail.senderEmail)}>` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{mail.provider === "gmail" ? "App Password" : "API key"}</dt>
              <dd className="font-mono">{mail.secretHint ?? "—"}</dd>
            </div>
          </dl>
          {mail.configured && (
            <div
              className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
                mailCheck.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              <p className="flex items-start gap-2">
                {mailCheck.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <span>
                  {mailCheck.ok
                    ? `Signed in to ${mail.provider === "gmail" ? "Gmail" : "Brevo"} successfully. Emails will be delivered.`
                    : mailCheck.error}
                  <span className="block text-xs opacity-80">
                    Checked {mailCheck.checkedAt.toLocaleTimeString("en-GB", { timeZone: "Africa/Kigali", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </span>
              </p>
              <a href="/admin/integrations?recheck=1" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Check again
              </a>
            </div>
          )}
          {!mail.configured && (
            <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
              Missing in <code>.env</code>: <code>{mail.missing.join(", ")}</code>.{" "}
              {mail.provider === "gmail" ? (
                <>
                  Turn on 2-Step Verification, create an App Password at <strong>myaccount.google.com/apppasswords</strong>, paste it into <code>GMAIL_APP_PASSWORD</code> and your
                  address into <code>GMAIL_USER</code>, then restart.
                </>
              ) : (
                <>Set the Brevo API key and a verified sender, then restart.</>
              )}{" "}
              Until then, emails are logged as <em>skipped</em> and voting is unaffected.
            </p>
          )}
          <TestEmailForm disabled={!mail.configured} />
        </Card>

        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <Brain className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Edge Impulse</h2>
                <p className="text-sm text-muted">Training data upload (Ingestion API)</p>
              </div>
            </div>
            <Badge tone={ei.ok ? "success" : "warning"} dot>
              {ei.ok ? "Connected" : "Not connected"}
            </Badge>
          </div>
          {ei.ok ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Project</dt>
                <dd className="font-medium">{ei.project.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Project ID</dt>
                <dd className="font-mono">{ei.project.id}</dd>
              </div>
              <a href={ei.project.studioUrl} target="_blank" rel="noreferrer" className="btn-secondary mt-2 w-full">
                Open in Edge Impulse Studio <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </dl>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-danger">{ei.error}</p>
              <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                In Edge Impulse Studio open your project → <strong>Dashboard → Keys</strong>, copy the API key and set <code>EDGE_IMPULSE_API_KEY</code> in <code>.env</code>.
                Works on the free plan. The trained model itself is deployed as WebAssembly files (see <code>docs/MODEL_TRAINING.md</code>).
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Email log (latest 20)</h2>
        {emails.length === 0 ? (
          <EmptyState Icon={Mail} title="No emails yet">Emails appear here after a registration, a vote or a test.</EmptyState>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-y border-border bg-surface-2 text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-6 py-2.5 font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">To</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-6 py-2.5 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emails.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-muted">
                      {m.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Kigali", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-3">{typeLabel[m.type] ?? m.type}</td>
                    <td className="px-3 py-3 font-mono text-xs">{m.toMasked}</td>
                    <td className="px-3 py-3">
                      <Badge tone={statusTone[m.status]} dot>
                        {m.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="max-w-xs truncate px-6 py-3 text-xs text-muted" title={m.error ?? m.providerId ?? ""}>
                      {m.error ?? m.providerId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
