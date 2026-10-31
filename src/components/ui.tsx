import Link from "next/link";
import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, CircleX, type LucideIcon } from "lucide-react";

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-fg shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight text-text">FaceVote</span>
        {subtitle && <span className="block text-[11px] font-medium uppercase tracking-wider text-subtle">{subtitle}</span>}
      </span>
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-6 ${className}`}>{children}</div>;
}

type AlertKind = "info" | "error" | "success" | "warning";
const alertStyles: Record<AlertKind, { cls: string; Icon: LucideIcon }> = {
  info: { cls: "bg-primary-soft text-primary border-primary/20", Icon: Info },
  error: { cls: "bg-danger-soft text-danger border-danger/20", Icon: CircleX },
  success: { cls: "bg-success-soft text-success border-success/20", Icon: CircleCheck },
  warning: { cls: "bg-warning-soft text-warning border-warning/20", Icon: TriangleAlert },
};

export function Alert({ kind = "info", children }: { kind?: AlertKind; children: ReactNode }) {
  const { cls, Icon } = alertStyles[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Steps({ current, steps }: { current: number; steps: string[] }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                done ? "bg-success text-white dark:text-bg" : active ? "bg-primary text-primary-fg" : "bg-surface-2 text-subtle"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`hidden font-medium sm:inline ${active ? "text-text" : "text-subtle"}`}>{s}</span>
            {i < steps.length - 1 && <span className={`h-px flex-1 ${done ? "bg-success" : "bg-border"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "lg";
}) {
  return (
    <Link href={href} className={`btn-${variant} ${size === "lg" ? "btn-lg" : ""}`}>
      {children}
    </Link>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneStyles[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const electionTone = { OPEN: "success", DRAFT: "neutral", CLOSED: "danger" } as const;

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({ label, value, hint, Icon }: { label: string; value: ReactNode; hint?: ReactNode; Icon: LucideIcon }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Avatar({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function EmptyState({ Icon, title, children }: { Icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-subtle">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Form field with label, optional hint, and an inline error that is announced to screen readers. */
export function Field({
  id,
  label,
  error,
  hint,
  optional,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
          <CircleX className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Props that wire an input to its Field's error/hint for accessibility + red border. */
export function fieldProps(id: string, error?: string) {
  return {
    id,
    name: id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : `${id}-hint`,
    className: `input ${error ? "border-danger focus:border-danger" : ""}`,
  } as const;
}

/** Shows an API error: what went wrong (bold) + what to do next. */
export function ProblemAlert({ problem, kind = "error" }: { problem: { message: string; hint?: string } | null; kind?: "error" | "warning" }) {
  if (!problem) return null;
  return (
    <Alert kind={kind}>
      <p className="font-semibold">{problem.message}</p>
      {problem.hint && <p className="mt-0.5 opacity-90">{problem.hint}</p>}
    </Alert>
  );
}

// Class names kept for existing call sites
export const inputClass = "input";
export const buttonClass = "btn-primary";
export const secondaryButtonClass = "btn-secondary";
