import { Activity } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { maskNationalId } from "@/lib/rwanda";

type Attempt = {
  id: string;
  identifier: string;
  stage: string;
  success: boolean;
  reason: string | null;
  distance: number | null;
  createdAt: Date;
  voter?: { firstName: string; lastName: string } | null;
};

/** Prisma include for AttemptsTable rows. */
export const attemptInclude = { voter: { select: { firstName: true, lastName: true } } } as const;

export const REASON_LABELS: Record<string, string> = {
  not_registered: "Not on the register",
  wrong_pin: "Wrong PIN",
  bad_credentials: "Wrong number or PIN",
  face_mismatch: "Face mismatch",
  liveness: "Liveness failed",
  not_eligible: "Not eligible",
  no_enrolment: "No face enrolled",
  already_voted: "Already voted",
  otp_sent: "Reset code emailed",
  wrong_otp: "Wrong reset code",
  pin_reset: "PIN changed by email code",
};

const STAGE_LABELS: Record<string, string> = { credentials: "ID + PIN", face: "Face", otp_request: "PIN reset · request", otp: "PIN reset · code" };

/** Stages that count as identity verification (excludes PIN-reset events) for success-rate stats. */
export const IDENTITY_STAGES = ["credentials", "face"];

export function AttemptsTable({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) {
    return <EmptyState Icon={Activity} title="No verification attempts yet">Attempts appear here as voters verify.</EmptyState>;
  }
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-y border-border bg-surface-2 text-xs uppercase tracking-wider text-subtle">
          <tr>
            <th className="px-6 py-2.5 font-semibold">Time</th>
            <th className="px-3 py-2.5 font-semibold">National ID / voter</th>
            <th className="px-3 py-2.5 font-semibold">Step</th>
            <th className="px-3 py-2.5 font-semibold">Result</th>
            <th className="px-3 py-2.5 font-semibold">Reason</th>
            <th className="px-6 py-2.5 text-right font-semibold">Face distance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {attempts.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-6 py-3 text-muted">
                {a.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-3 py-3">
                <p className="font-mono text-xs">{maskNationalId(a.identifier)}</p>
                <p className="text-xs text-subtle">{a.voter ? `${a.voter.firstName} ${a.voter.lastName}` : "Unknown"}</p>
              </td>
              <td className="px-3 py-3 text-muted">{STAGE_LABELS[a.stage] ?? a.stage}</td>
              <td className="px-3 py-3">
                <Badge tone={a.success ? "success" : "danger"} dot>
                  {a.success ? "Verified" : "Rejected"}
                </Badge>
              </td>
              <td className="px-3 py-3 text-muted">{a.reason ? (REASON_LABELS[a.reason] ?? a.reason) : "—"}</td>
              <td className="px-6 py-3 text-right font-mono tabular-nums">{a.distance !== null ? a.distance.toFixed(3) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
