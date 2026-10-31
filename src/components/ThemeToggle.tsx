"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";
const KEY = "facevote-theme";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Light / dark / system switch. The choice is remembered in localStorage. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try {
      saved = (localStorage.getItem(KEY) as Theme | null) ?? "system";
    } catch {}
    setTheme(saved);
  }, []);

  // Follow OS changes while on "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
  }

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div role="radiogroup" aria-label="Colour theme" className={`inline-flex rounded-xl border border-border bg-surface-2 p-0.5 ${className}`}>
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={`rounded-[10px] p-1.5 transition ${theme === value ? "bg-surface text-text shadow-sm" : "text-subtle hover:text-text"}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
