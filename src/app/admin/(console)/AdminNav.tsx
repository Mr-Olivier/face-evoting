"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Brain, ExternalLink, Images, Landmark, LayoutDashboard, LogOut, Menu, Plug, Users, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Logo } from "@/components/ui";

const links = [
  { href: "/admin", label: "Overview", Icon: LayoutDashboard },
  { href: "/admin/elections", label: "Elections", Icon: Landmark },
  { href: "/admin/voters", label: "Voters", Icon: Users },
  { href: "/admin/activity", label: "Verification log", Icon: Activity },
  { href: "/admin/model", label: "AI model", Icon: Brain },
  { href: "/admin/dataset", label: "Data collection", Icon: Images },
  { href: "/admin/integrations", label: "Integrations", Icon: Plug },
];

export default function AdminNav({ integrations }: { integrations: { email: boolean; edgeImpulse: boolean } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/";
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map(({ href, label, Icon }) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {href === "/admin/integrations" && (
              <span
                className="ml-auto flex items-center gap-1"
                title={`Email: ${integrations.email ? "connected" : "not connected"} · Edge Impulse: ${integrations.edgeImpulse ? "connected" : "not connected"}`}
              >
                <span className={`h-2 w-2 rounded-full ${integrations.email ? "bg-success" : "bg-warning"}`} />
                <span className={`h-2 w-2 rounded-full ${integrations.edgeImpulse ? "bg-success" : "bg-warning"}`} />
                <span className="sr-only">
                  Email {integrations.email ? "connected" : "not connected"}, Edge Impulse {integrations.edgeImpulse ? "connected" : "not connected"}
                </span>
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto space-y-1 border-t border-border pt-4">
        <Link href="/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
          <ExternalLink className="h-4 w-4" aria-hidden /> Open voter site
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-danger-soft hover:text-danger">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-xs text-subtle">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <Logo subtitle="Admin console" />
        <button className="btn-ghost p-2" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && <div className="flex min-h-[calc(100vh-61px)] flex-col border-b border-border bg-surface p-4 lg:hidden">{nav}</div>}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 border-r border-border bg-surface p-5 lg:flex">
        <Logo subtitle="Admin console" />
        {nav}
      </aside>
    </>
  );
}
