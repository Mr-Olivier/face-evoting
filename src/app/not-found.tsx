import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div>
          <p className="text-6xl font-bold tracking-tight text-subtle">404</p>
          <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
          <p className="mt-1 text-muted">The page you are looking for doesn&apos;t exist.</p>
        </div>
        <Link href="/" className="btn-primary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
