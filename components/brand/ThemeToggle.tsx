"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("vest-theme");
    const dark = stored === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("vest-theme", next ? "dark" : "light");
  };

  if (!mounted) {
    return <div className={cn("h-8 w-8", className)} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text",
        className,
      )}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
