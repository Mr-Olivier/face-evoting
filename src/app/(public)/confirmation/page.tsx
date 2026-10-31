import { CircleCheck, EyeOff } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import ReceiptCard from "./Receipt";

export const metadata = { title: "Vote recorded" };

export default function ConfirmationPage() {
  return (
    <div className="card mx-auto max-w-lg space-y-6 p-10 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success">
        <CircleCheck className="h-9 w-9" aria-hidden />
      </span>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your vote has been recorded</h1>
        <p className="mt-2 text-muted">Thank you for taking part. Your verification session has ended.</p>
      </div>
      <ReceiptCard />
      <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-left text-sm text-muted">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Your ballot is stored separately from your identity, with no link between them, so nobody can see who you voted for.
      </div>
      <ButtonLink href="/">Back to home</ButtonLink>
    </div>
  );
}
