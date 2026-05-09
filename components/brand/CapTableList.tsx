"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type ShieldStatus } from "@/components/brand/StatusBadge";
import { RegisterBanner } from "@/components/brand/RegisterBanner";
import { Skeleton } from "@/components/primitives/Skeleton";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenSymbolFromMint } from "@/lib/tokens";
import { formatAmount, formatRelative } from "@/lib/utils";

type Row = {
  id: string;
  project_name: string;
  mint: string;
  total: string;
  shield_status: ShieldStatus;
  created_at: string;
};

export function CapTableList() {
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "list_cap_tables");
        const res = await fetch("/api/cap-tables", {
          headers: authHeaders(auth),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(data.cap_tables ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58()]);

  if (rows === null && !error) {
    return (
      <div className="mx-auto max-w-container px-6 py-12">
        <RegisterBanner />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  }

  if (rows && rows.length === 0) {
    return (
      <div className="mx-auto max-w-container px-6 py-12">
        <RegisterBanner />
        <div className="mx-auto flex min-h-[50vh] max-w-[480px] flex-col items-center justify-center gap-3 text-center">
          <h2 className="text-2xl tracking-h2">No vests yet.</h2>
          <p className="text-text-muted">
            Create one to start running private payouts.
          </p>
          <Link href="/dashboard/new" className="mt-4">
            <Button>Create a vest</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container px-6 py-10">
      <RegisterBanner />
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-2xl tracking-h2">Vests</h1>
        <Link href="/dashboard/new">
          <Button>Create a vest</Button>
        </Link>
      </div>
      {error && (
        <div className="mt-4 text-sm text-danger">{error}</div>
      )}
      <div className="mt-6 border-t border-border">
        {(rows ?? []).map((r) => {
          const decimals = r.mint && tokenSymbolFromMint(r.mint) === "SOL" ? 9 : 6;
          const sym = tokenSymbolFromMint(r.mint);
          return (
            <Link
              href={`/dashboard/${r.id}`}
              key={r.id}
              className="flex items-center justify-between gap-4 border-b border-border px-2 py-4 transition-colors hover:bg-surface-sunken"
            >
              <span className="flex-1 truncate text-text">{r.project_name}</span>
              <span className="font-mono text-sm text-text">
                {formatAmount(BigInt(r.total), decimals)} {sym}
              </span>
              <StatusBadge status={r.shield_status} />
              <span className="w-32 text-right text-xs text-text-subtle">
                {formatRelative(new Date(r.created_at))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
