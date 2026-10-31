"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";
import { Alert, Field, ProblemAlert, fieldProps } from "@/components/ui";
import { ApiError, callApi } from "@/lib/client-api";

export default function TestEmailForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);
  const [fieldError, setFieldError] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSent(false);
    setProblem(null);
    setFieldError(undefined);
    try {
      await callApi("/api/admin/integrations/test-email", { body: { to } });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldError(err.fieldErrors.to);
        if (!err.fieldErrors.to) setProblem({ message: err.message, hint: err.hint });
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <Field id="to" label="Send a test email to" error={fieldError}>
        <div className="flex gap-2">
          <input {...fieldProps("to", fieldError)} type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} disabled={disabled} />
          <button className="btn-primary shrink-0" disabled={disabled || busy || !to}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send
          </button>
        </div>
      </Field>
      {sent && <Alert kind="success">Sent. Check the inbox (and the spam folder) in a minute.</Alert>}
      <ProblemAlert problem={problem} />
    </form>
  );
}
