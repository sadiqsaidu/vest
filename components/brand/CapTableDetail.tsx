"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/primitives/Stat";
import { StatusBadge, type ShieldStatus } from "@/components/brand/StatusBadge";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenSymbolFromMint, TOKENS } from "@/lib/tokens";
import { formatAmount, truncateAddress } from "@/lib/utils";

type CapTable = {
  id: string;
  project_name: string;
  mint: string;
  total: string;
  shield_status: ShieldStatus;
  test_mode: boolean;
  created_at: string;
};

type ScheduleRow = {
  id: string;
  beneficiary_wallet: string;
  beneficiary_label: string;
  unlock_timestamp: number;
  amount: string;
  status: string;
};

type Resp = { cap_table: CapTable; schedule: ScheduleRow[] };

export function CapTableDetail({ id }: { id: string }) {
  const wallet = useWallet();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.connected) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "read_cap_table");
        const res = await fetch(`/api/cap-tables/${id}`, {
          headers: authHeaders(auth),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.connected, wallet.publicKey, id]);

  if (error)
    return (
      <div className="mx-auto max-w-container px-6 py-10 text-sm text-danger">
        {error}
      </div>
    );

  if (!data)
    return (
      <div className="mx-auto max-w-container px-6 py-10 text-sm text-text-subtle">
        Loading…
      </div>
    );

  const { cap_table: ct, schedule } = data;
  const sym = tokenSymbolFromMint(ct.mint);
  const decimals =
    Object.values(TOKENS).find((t) => t.mint === ct.mint)?.decimals ?? 6;

  const grouped = new Map<string, ScheduleRow[]>();
  for (const s of schedule) {
    const list = grouped.get(s.beneficiary_wallet) ?? [];
    list.push(s);
    grouped.set(s.beneficiary_wallet, list);
  }

  return (
    <div className="mx-auto max-w-container px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-h1">{ct.project_name}</h1>
          <div className="text-sm text-text-muted">
            <span className="font-mono">{sym}</span>{" "}
            <span className="text-text-subtle">{truncateAddress(ct.mint, 6)}</span>
          </div>
        </div>
        <StatusBadge status={ct.shield_status} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total committed"
          value={`${formatAmount(BigInt(ct.total), decimals)} ${sym}`}
        />
        <Stat label="Vested to date" value="—" />
        <Stat label="Claimed" value="—" />
        <Stat label="Locked" value="—" />
      </div>

      {ct.shield_status === "pending" && (
        <div className="space-y-4 rounded-md bg-surface-sunken p-6">
          <div className="space-y-1">
            <h2 className="text-lg tracking-h2">Next step</h2>
            <p className="text-sm text-text-muted">
              This vault hasn&rsquo;t been shielded yet. Click below to deposit
              your treasury into an encrypted balance and create unlock UTXOs.
            </p>
          </div>
          <Link href={`/dashboard/${ct.id}/shield`}>
            <Button size="lg">Shield treasury</Button>
          </Link>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg tracking-h2">Beneficiaries</h2>
        <div className="border-t border-border">
          {[...grouped.entries()].map(([w, items]) => {
            const total = items.reduce((acc, s) => acc + BigInt(s.amount), 0n);
            const label = items[0].beneficiary_label;
            return (
              <div
                key={w}
                className="flex flex-col gap-2 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm text-text">{label}</div>
                  <div className="font-mono text-xs text-text-subtle">
                    {truncateAddress(w, 6)}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-text-muted">
                    {items.length} unlock{items.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-mono text-text">
                    {formatAmount(total, decimals)} {sym}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
