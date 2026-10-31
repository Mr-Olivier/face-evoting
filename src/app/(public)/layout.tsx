import Link from "next/link";
import { Lock } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Logo } from "@/components/ui";

// Public voter-facing shell. Deliberately has no link to the admin console.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="FaceVote home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/#how-it-works" className="btn-ghost hidden sm:inline-flex">
              How it works
            </Link>
            <Link href="/#security" className="btn-ghost hidden sm:inline-flex">
              Security
            </Link>
            <ThemeToggle />
            <Link href="/verify" className="btn-primary">
              Vote now
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Your ballot is stored separately from your identity.
          </p>
          <p>FaceVote · CMU-Africa Bridge Program student prototype</p>
        </div>
      </footer>
    </div>
  );
}
