"use client";

import { useState } from "react";
import { LoaderCircle, Lock, ShieldCheck } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Alert, Logo } from "@/components/ui";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/admin";
    } else {
      setError((await res.json()).error ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo subtitle="Election officer console" />
        </div>
        <div className="card space-y-5 p-7">
          <div>
            <h1 className="text-xl font-bold">Sign in</h1>
            <p className="mt-1 text-sm text-muted">Restricted area for authorised election officers.</p>
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="password">Admin password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-subtle">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Sessions expire after 8 hours.
        </p>
      </div>
    </div>
  );
}
