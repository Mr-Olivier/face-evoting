"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, LoaderCircle, Lock } from "lucide-react";
import { Alert, Avatar } from "@/components/ui";
import { ApiError, callApi } from "@/lib/client-api";

type Candidate = { id: string; name: string; party: string | null; bio: string | null; photoUrl: string | null };

function useCountdown(expiresAt: number) {
  const [left, setLeft] = useState(() => Math.max(0, expiresAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, expiresAt - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left;
}

export default function BallotForm({ candidates, expiresAt }: { candidates: Candidate[]; expiresAt: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const choice = candidates.find((c) => c.id === selected);

  const left = useCountdown(expiresAt);
  const expired = left === 0;
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");

  async function castVote() {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const data = await callApi<{ receipt: unknown }>("/api/votes", { body: { candidateId: selected } });
      try {
        sessionStorage.setItem("facevote-receipt", JSON.stringify(data.receipt));
      } catch {}
      router.replace("/confirmation");
    } catch (e) {
      setError(e instanceof ApiError ? (e.hint ? `${e.message} ${e.hint}` : e.message) : "Could not record your vote.");
      setSubmitting(false);
    }
  }

  async function cancel() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/");
  }

  const timer = (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${
        expired ? "bg-danger-soft text-danger" : left < 60_000 ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"
      }`}
    >
      <Clock className="h-4 w-4" aria-hidden />
      {expired ? "Session expired" : `Session ends in ${mm}:${ss}`}
    </div>
  );

  if (expired) {
    return (
      <div className="card mx-auto max-w-md space-y-4 p-8 text-center">
        {timer}
        <p className="text-muted">For your security, your verification expired. Please verify again to vote.</p>
        <button className="btn-primary" onClick={() => router.replace("/verify")}>
          Verify again
        </button>
      </div>
    );
  }

  if (reviewing && choice) {
    return (
      <div className="card mx-auto max-w-md space-y-6 p-8 text-center">
        <div className="flex justify-center">{timer}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">You are voting for</p>
          <div className="mt-4 flex flex-col items-center gap-3">
            <Avatar name={choice.name} src={choice.photoUrl} size={96} />
            <p className="text-2xl font-bold">{choice.name}</p>
            {choice.party && <p className="text-muted">{choice.party}</p>}
          </div>
        </div>
        <Alert kind="warning">Once submitted, your vote is final and cannot be changed.</Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-secondary" onClick={() => setReviewing(false)} disabled={submitting}>
            Change choice
          </button>
          <button className="btn-primary" onClick={castVote} disabled={submitting}>
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            {submitting ? "Submitting…" : "Submit vote"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{timer}</div>
      <div role="radiogroup" aria-label="Candidates" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((c) => {
          const active = c.id === selected;
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(c.id)}
              className={`card relative p-5 text-left transition outline-none focus-visible:ring-4 focus-visible:ring-(--ring) ${
                active ? "border-primary ring-4 ring-(--ring)" : "hover:border-border-strong"
              }`}
            >
              <span
                className={`absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full border-2 ${
                  active ? "border-primary bg-primary text-primary-fg" : "border-border-strong"
                }`}
                aria-hidden
              >
                {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <div className="flex items-center gap-4 pr-8">
                <Avatar name={c.name} src={c.photoUrl} size={60} />
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{c.name}</p>
                  {c.party && <p className="text-sm text-muted">{c.party}</p>}
                </div>
              </div>
              {c.bio && <p className="mt-4 text-sm text-muted">{c.bio}</p>}
            </button>
          );
        })}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-6">
        <button className="btn-ghost" onClick={cancel}>
          Cancel and exit
        </button>
        <button className="btn-primary btn-lg" disabled={!selected} onClick={() => setReviewing(true)}>
          Review vote <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
