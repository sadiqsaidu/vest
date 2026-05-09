"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenSymbolFromMint } from "@/lib/tokens";
import { formatScopeLabel } from "@/lib/umbra/viewing-keys";
import { cn, formatRelative } from "@/lib/utils";
import { GenerateViewingKeyModal } from "./GenerateViewingKeyModal";

type Row = {
  id: string;
  recipient_label: string;
  scope: "master" | "mint" | "yearly" | "monthly";
  scope_params: { mint?: string; year?: number; month?: number };
  status: "pending" | "active";
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export function ViewingKeysList({
  capTableId,
  capTableMint,
}: {
  capTableId: string;
  capTableMint: string;
}) {
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "list_viewing_keys");
        const res = await fetch(
          `/api/viewing-keys/list?cap_table_id=${capTableId}`,
          { headers: authHeaders(auth) },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(data.keys ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58(), capTableId, tick]);

  const onRevoke = async (id: string) => {
    if (!confirm("Revoke this viewing key? Anyone who already accessed it still has the data they pulled.")) return;
    setRevoking(id);
    try {
      const auth = await signAuth(wallet, "revoke_viewing_key");
      const res = await fetch(`/api/viewing-keys/${id}/revoke`, {
        method: "POST",
        headers: authHeaders(auth),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm tracking-h2 text-text-muted">Viewing keys</h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <KeyRound size={12} />
          Generate
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-md border border-border bg-surface-sunken px-4 py-6 text-sm text-text-muted">
          No viewing keys issued. Issue a key to share read access with
          auditors, lawyers, or beneficiaries&rsquo; tax preparers.
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="border-t border-border">
          {rows.map((r) => (
            <KeyRow
              key={r.id}
              row={r}
              capTableMint={capTableMint}
              onRevoke={() => onRevoke(r.id)}
              revoking={revoking === r.id}
            />
          ))}
        </ul>
      )}

      <GenerateViewingKeyModal
        capTableId={capTableId}
        capTableMint={capTableMint}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={refresh}
      />
    </section>
  );
}

function KeyRow({
  row,
  capTableMint,
  onRevoke,
  revoking,
}: {
  row: Row;
  capTableMint: string;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const symbol = row.scope_params?.mint
    ? tokenSymbolFromMint(row.scope_params.mint)
    : tokenSymbolFromMint(capTableMint);
  const scopeLabel = formatScopeLabel(row.scope, row.scope_params, symbol);
  const expired =
    row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  const revoked = !!row.revoked_at;
  const state: { label: string; cls: string } = revoked
    ? { label: "Revoked", cls: "text-danger" }
    : expired
      ? { label: "Expired", cls: "text-warning" }
      : { label: "Active", cls: "text-success" };

  return (
    <li
      className={cn(
        "grid grid-cols-1 items-center gap-3 border-b border-border py-3 sm:grid-cols-[1fr_1.4fr_repeat(3,minmax(0,1fr))_auto]",
      )}
    >
      <div className="text-sm">
        <span
          className="inline-flex h-5 items-center rounded border border-border px-1.5 text-[11px] uppercase tracking-wider text-text-muted"
          title={`Scope: ${row.scope}`}
        >
          {scopeLabel}
        </span>
      </div>
      <div className="min-w-0 truncate text-sm text-text">
        {row.recipient_label}
        <div className={cn("text-[11px]", state.cls)}>{state.label}</div>
      </div>
      <Cell label="Created">{formatRelative(new Date(row.created_at))}</Cell>
      <Cell label="Expires">
        {row.expires_at
          ? formatRelative(new Date(row.expires_at))
          : "Never"}
      </Cell>
      <Cell label="Last accessed">
        {row.last_accessed_at
          ? formatRelative(new Date(row.last_accessed_at))
          : "—"}
      </Cell>
      <RowActions row={row} onRevoke={onRevoke} revoking={revoking} />
    </li>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm text-text">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle sm:hidden">
        {label}{" "}
      </span>
      <span className="text-text-muted">{children}</span>
    </div>
  );
}

function RowActions({
  row,
  onRevoke,
  revoking,
}: {
  row: Row;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const auditUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/audit?key=`; // we don't have the access token after creation
  const onCopy = async () => {
    try {
      // We only know the audit URL prefix here — copying it gives the auditor
      // the destination, but not the token. Most usage flows hand the link
      // directly from the modal at generation time. This action just copies
      // the audit page URL for convenience when re-sending.
      await navigator.clipboard.writeText(auditUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  const revoked = !!row.revoked_at;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCopy}
        title="Copy audit URL prefix"
        className="inline-flex h-8 items-center gap-1 rounded border border-border bg-surface px-2 text-xs text-text hover:border-border-strong"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        Copy URL
      </button>
      {!revoked && (
        <button
          type="button"
          onClick={onRevoke}
          disabled={revoking}
          className="inline-flex h-8 items-center rounded border border-border bg-surface px-2 text-xs text-danger hover:border-danger disabled:opacity-50"
        >
          {revoking ? "Revoking…" : "Revoke"}
        </button>
      )}
    </div>
  );
}
