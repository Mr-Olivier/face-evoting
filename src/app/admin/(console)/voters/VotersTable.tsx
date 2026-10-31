"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LoaderCircle, Mail, Search, Users } from "lucide-react";
import { ApiError, callApi } from "@/lib/client-api";
import { Badge, EmptyState } from "@/components/ui";

type Voter = {
  id: string;
  voterNumber: string;
  nationalIdMasked: string;
  nationalIdLast: string;
  fullName: string;
  phone: string;
  hasEmail: boolean;
  location: string;
  isEligible: boolean;
  createdAt: string;
  voted: boolean;
};

export default function VotersTable({ voters }: { voters: Voter[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function resend(v: Voter, kind: "registration" | "vote_confirmation") {
    setMenu(null);
    setSending(v.id);
    setNotice(null);
    try {
      const r = await callApi<{ to: string }>(`/api/admin/voters/${v.id}/email`, { body: { kind } });
      setNotice({ id: v.id, ok: true, text: `${kind === "registration" ? "Registration details" : "Vote confirmation"} sent to ${r.to}.` });
    } catch (e) {
      setNotice({ id: v.id, ok: false, text: e instanceof ApiError ? e.message : "The email was not sent." });
    } finally {
      setSending(null);
    }
  }

  const query = q.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const rows = query
    ? voters.filter(
        (v) =>
          v.voterNumber.toLowerCase().includes(query) ||
          v.fullName.toLowerCase().includes(query) ||
          v.location.toLowerCase().includes(query) ||
          (digits.length >= 3 && v.nationalIdLast.includes(digits)),
      )
    : voters;

  async function toggle(v: Voter) {
    setBusy(v.id);
    await fetch(`/api/admin/voters/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEligible: !v.isEligible }),
    });
    setBusy(null);
    router.refresh();
  }

  if (voters.length === 0) {
    return <EmptyState Icon={Users} title="No voters registered yet">Register the first voter with the form above.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input className="input pl-9" placeholder="Search name, voter number, district or last ID digits" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search voters" />
      </div>
      <div className="-mx-6 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-y border-border bg-surface-2 text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-6 py-2.5 font-semibold">Voter</th>
              <th className="px-3 py-2.5 font-semibold">National ID</th>
              <th className="px-3 py-2.5 font-semibold">Location</th>
              <th className="px-3 py-2.5 font-semibold">Contact</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Registered</th>
              <th className="px-6 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((v) => (
              <tr key={v.id} className="hover:bg-surface-2/60">
                <td className="px-6 py-3">
                  <p className="font-semibold">{v.fullName}</p>
                  <p className="font-mono text-xs text-subtle">
                    {v.voterNumber}
                    {v.voterNumber.startsWith("DEMO-") && <span className="ml-1.5 font-sans">· sample</span>}
                  </p>
                </td>
                <td className="px-3 py-3 font-mono text-xs">{v.nationalIdMasked}</td>
                <td className="px-3 py-3 text-muted">{v.location}</td>
                <td className="px-3 py-3">
                  <p className="font-mono text-xs">{v.phone}</p>
                  {v.hasEmail && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-subtle">
                      <Mail className="h-3 w-3" aria-hidden /> email on file
                    </p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={v.isEligible ? "success" : "neutral"} dot>
                      {v.isEligible ? "Eligible" : "Suspended"}
                    </Badge>
                    {v.voted && <Badge tone="primary">Voted</Badge>}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted">{new Date(v.createdAt).toLocaleDateString("en-GB")}</td>
                <td className="px-6 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    {v.hasEmail && (
                      <button
                        className="btn-ghost px-3 py-1.5 text-xs"
                        disabled={sending === v.id}
                        onClick={() => setMenu(menu === v.id ? null : v.id)}
                        aria-haspopup="menu"
                        aria-expanded={menu === v.id}
                      >
                        {sending === v.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                        Email
                        <ChevronDown className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === v.id} onClick={() => toggle(v)}>
                      {v.isEligible ? "Suspend" : "Restore"}
                    </button>
                  </div>
                  {menu === v.id && (
                    <div className="flex justify-end">
                      <div role="menu" className="card mt-1 w-56 p-1 text-left">
                        <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => resend(v, "registration")}>
                          Resend registration details
                        </button>
                        <button
                          role="menuitem"
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!v.voted}
                          title={v.voted ? undefined : "This voter hasn't voted yet"}
                          onClick={() => resend(v, "vote_confirmation")}
                        >
                          Resend vote confirmation
                        </button>
                      </div>
                    </div>
                  )}
                  {notice?.id === v.id && <p className={`mt-1 text-xs ${notice.ok ? "text-success" : "text-danger"}`}>{notice.text}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-6 py-6 text-sm text-muted">No voters match “{q}”.</p>}
      </div>
    </div>
  );
}
