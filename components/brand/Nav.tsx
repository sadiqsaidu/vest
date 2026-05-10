"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Check, Copy, LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { cn, truncateAddress } from "@/lib/utils";
import { clearSessionAuth } from "@/lib/walletAuth";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const connected = wallet.connected && wallet.publicKey;

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
          {connected ? (
            <WalletPill wallet={wallet} />
          ) : (
            <Link
              href="/dashboard"
              className="ml-1 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Launch app
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function WalletPill({
  wallet,
}: {
  wallet: ReturnType<typeof useWallet>;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  if (!wallet.publicKey) return null;
  const address = wallet.publicKey.toBase58();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const onDisconnect = async () => {
    clearSessionAuth(address);
    try {
      await wallet.disconnect();
    } catch {
      /* wallet refused; ignore */
    }
    setOpen(false);
  };

  return (
    <div className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs text-text hover:border-border-strong"
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--success, #22c55e)" }}
        />
        <span className="font-mono">{truncateAddress(address, 4)}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            className="absolute right-0 top-11 z-40 w-[260px] rounded-md border border-border bg-surface p-2 text-sm shadow-md"
            role="menu"
          >
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-text-subtle">
              Connected
            </div>
            <div className="break-all rounded bg-surface-sunken px-2 py-1.5 font-mono text-[11px] text-text">
              {address}
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="mt-2 flex w-full items-center gap-2 rounded px-2 py-1.5 text-text hover:bg-surface-sunken"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy address"}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-danger hover:bg-surface-sunken"
            >
              <LogOut size={12} />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
