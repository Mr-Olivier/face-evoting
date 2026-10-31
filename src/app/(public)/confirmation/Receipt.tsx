"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, Check } from "lucide-react";

type Receipt = { code: string; votedAt: string; electionTitle: string; emailedTo: string | null };

/** Shows the participation reference saved by the ballot form (kept only in this browser tab). */
export default function ReceiptCard() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("facevote-receipt");
      if (raw) setReceipt(JSON.parse(raw));
    } catch {}
  }, []);

  if (!receipt) return null;

  return (
    <div className="space-y-3 text-left">
      <dl className="divide-y divide-border rounded-xl border border-border">
        <div className="flex justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted">Election</dt>
          <dd className="text-right font-medium">{receipt.electionTitle}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted">Recorded on</dt>
          <dd className="text-right font-medium">{receipt.votedAt}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted">Participation reference</dt>
          <dd className="flex items-center gap-2">
            <span className="font-mono text-base font-bold tracking-wider">{receipt.code}</span>
            <button
              type="button"
              className="rounded-lg p-1.5 text-subtle hover:bg-surface-2 hover:text-text"
              aria-label="Copy reference"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(receipt.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </dd>
        </div>
      </dl>
      {receipt.emailedTo && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Mail className="h-4 w-4 shrink-0" aria-hidden /> A confirmation has been sent to <span className="font-medium text-text">{receipt.emailedTo}</span>.
        </p>
      )}
      <p className="text-xs text-subtle">The reference proves that you took part. It does not reveal your choice.</p>
    </div>
  );
}
