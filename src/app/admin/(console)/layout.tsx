import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { verifyEmail } from "@/lib/email/mailer";
import { getProject } from "@/lib/edge-impulse-api";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

// Admin console shell. The middleware already hides it; this is a second check on the server.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) notFound();
  const [email, ei] = await Promise.all([verifyEmail(), getProject()]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <AdminNav integrations={{ email: email.ok, edgeImpulse: ei.ok }} />
      <main className="min-w-0 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-8">{children}</div>
      </main>
    </div>
  );
}
