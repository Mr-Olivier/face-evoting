"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Power, RotateCcw } from "lucide-react";

async function patchStatus(id: string, status: "DRAFT" | "OPEN" | "CLOSED") {
  const res = await fetch(`/api/admin/elections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update election");
}

export function ElectionStatusButtons({ id, status }: { id: string; status: "DRAFT" | "OPEN" | "CLOSED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function setStatus(next: "OPEN" | "CLOSED") {
    if (next === "CLOSED" && !confirming) return setConfirming(true);
    setBusy(true);
    try {
      await patchStatus(id, next);
    } finally {
      setBusy(false);
      setConfirming(false);
      router.refresh();
    }
  }

  if (status === "OPEN") {
    return (
      <div className="flex gap-2">
        {confirming && (
          <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
        )}
        <button className="btn-danger" disabled={busy} onClick={() => setStatus("CLOSED")}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
          {confirming ? "Confirm: close voting" : "Close voting"}
        </button>
      </div>
    );
  }
  return (
    <button className="btn-primary" disabled={busy} onClick={() => setStatus("OPEN")}>
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : status === "CLOSED" ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
      {status === "CLOSED" ? "Reopen voting" : "Open voting"}
    </button>
  );
}

export function AddCandidateForm({ electionId }: { electionId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [party, setParty] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ electionId, name, party: party || undefined, bio: bio || undefined }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Failed");
    setName("");
    setParty("");
    setBio("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-dashed border-border-strong p-4">
      <p className="text-sm font-semibold">Add a candidate</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <input className="input" placeholder="Party / slogan (optional)" value={party} onChange={(e) => setParty(e.target.value)} />
      </div>
      <input className="input" placeholder="Short manifesto (optional)" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
      <div className="flex items-center gap-3">
        <button className="btn-secondary" disabled={busy}>
          <Plus className="h-4 w-4" aria-hidden /> Add candidate
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

export function CreateElectionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/admin/elections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: description || undefined }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Failed");
    setTitle("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor="title">Election title</label>
        <input id="title" className="input" placeholder="e.g. Student Council Election 2027" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <input id="description" className="input" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        <Plus className="h-4 w-4" aria-hidden /> Create as draft
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
