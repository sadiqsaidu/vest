"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background,border-color,backdrop-filter] duration-200",
        scrolled
          ? "glass border-b border-border"
          : "bg-transparent border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-container items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <Link
            href="#"
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text"
          >
            Docs
          </Link>
          <ThemeToggle className="mx-1" />
          <Link
            href="/dashboard"
            className="ml-1 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Launch app
          </Link>
        </nav>
      </div>
    </header>
  );
}
