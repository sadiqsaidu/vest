"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Download, KeyRound, Shield, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/primitives/Money";
import { Address } from "@/components/primitives/Address";
import { Timestamp } from "@/components/primitives/Timestamp";
import { Skeleton } from "@/components/primitives/Skeleton";
import {
  ScheduleTimeline,
  type TimelineUnlock,
} from "@/components/primitives/ScheduleTimeline";
import { tokenByMint, tokenSymbolFromMint } from "@/lib/tokens";
import {
  isAccessToken,
  unwrapKey,
  bytesToBigInt,
  bytesToHexString,
} from "@/lib/viewingKeys/envelope";
import { formatScopeLabel } from "@/lib/umbra/viewing-keys";
import { cn, formatAmount, formatRelative, truncateAddress } from "@/lib/utils";

type ScopeKind = "master" | "mint" | "yearly" | "monthly";
type ScopeParams = { mint?: string; year?: number; month?: number };

type ScheduleRow = {
  id: string;
  beneficiary_wallet: string;
  beneficiary_label: string;
  unlock_timestamp: number;
  amount: string;
  status: "scheduled" | "utxo_created" | "claimed";
  utxo_commitment?: string | null;
  utxo_creation_tx?: string | null;
  claim_tx_signature?: string | null;
  claimed_at?: string | null;
};

type Ev = {
  kind:
    | "treasury_shielded"
    | "utxo_created"
    | "utxo_claimed"
    | "viewing_key_issued"
    | "viewing_key_revoked"
    | "viewing_key_accessed";
  at: string;
  signature?: string | null;
  data: Record<string, any>;
};

type DecryptResponse = {
  envelope_id: string;
  encrypted_key_payload: { v: 1; iv: string; ct: string };
  scope: ScopeKind;
  scope_params: ScopeParams;
  recipient_label: string;
  expires_at: string | null;
  issued_at: string;
  cap_table: {
    id: string;
    project_name: string;
    mint: string;
    total: string;
    commitment: string;
    shield_status: string;
    shield_tx_signature?: string | null;
    founder_wallet: string;
    created_at: string;
    test_mode: boolean;
  };
  schedule: ScheduleRow[];
  events: Ev[];
};

const SOLSCAN = "https://solscan.io/tx/";
const CLUSTER = "?cluster=devnet";
function solscanUrl(sig: string) {
  return `${SOLSCAN}${sig}${CLUSTER}`;
}

export function AuditView({ initialKey }: { initialKey?: string }) {
  const [token, setToken] = useState<string>(initialKey ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DecryptResponse | null>(null);
  const [keyHex, setKeyHex] = useState<string | null>(null);
  const [keyDecimal, setKeyDecimal] = useState<string | null>(null);

  const decrypt = async (input: string) => {
    setError(null);
    setLoading(true);
    setData(null);
    setKeyHex(null);
    setKeyDecimal(null);
    try {
      const trimmed = input.trim();
      if (!isAccessToken(trimmed)) {
        throw new Error("That doesn't look like a Vest viewing key.");
      }
      const res = await fetch("/api/viewing-keys/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: trimmed }),
      });
      if (res.status === 410) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          j?.error ?? "This viewing key has been revoked.",
        );
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Server returned ${res.status}`);
      }
      const json = (await res.json()) as DecryptResponse;
      // Decrypt the actual key bytes locally so we can display them.
      const keyBytes = await unwrapKey(
        trimmed,
        json.envelope_id,
        json.encrypted_key_payload,
      );
      const big = bytesToBigInt(keyBytes);
      setKeyHex(bytesToHexString(keyBytes));
      setKeyDecimal(big.toString());
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to decrypt");
    } finally {
      setLoading(false);
    }
  };

  // Auto-decrypt if a key is in the URL.
  useEffect(() => {
    if (initialKey && isAccessToken(initialKey)) {
      void decrypt(initialKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  if (!data && !loading && !error) {
    return <PasteForm token={token} onChange={setToken} onSubmit={() => decrypt(token)} />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-container px-6 py-10 space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-prose px-6 py-16 space-y-4">
        <h1 className="text-2xl tracking-h2 text-text">Couldn&rsquo;t open this</h1>
        <p className="text-sm text-danger">{error}</p>
        <PasteForm
          token={token}
          onChange={setToken}
          onSubmit={() => decrypt(token)}
        />
      </div>
    );
  }

  if (!data) return null;
  return (
    <AuditDashboard data={data} keyHex={keyHex} keyDecimal={keyDecimal} />
  );
}

/* -- Paste form ------------------------------------------------------------ */

function PasteForm({
  token,
  onChange,
  onSubmit,
}: {
  token: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[480px] items-center px-6">
      <div className="w-full space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-text-subtle">
            Auditor mode
          </span>
          <h1 className="text-2xl tracking-h2 text-text">Audit view</h1>
          <p className="text-sm text-text-muted">
            Paste a viewing key to view the records you&rsquo;ve been granted
            access to.
          </p>
        </div>
        <Input
          placeholder="vk_…"
          value={token}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
        />
        <Button onClick={onSubmit} className="w-full">
          Decrypt
        </Button>
      </div>
    </div>
  );
}

/* -- Dashboard render ------------------------------------------------------ */

function AuditDashboard({
  data,
  keyHex,
  keyDecimal,
}: {
  data: DecryptResponse;
  keyHex: string | null;
  keyDecimal: string | null;
}) {
  const tok = tokenByMint(data.cap_table.mint);
  const symbol = tok?.symbol ?? tokenSymbolFromMint(data.cap_table.mint);
  const decimals = tok?.decimals ?? 6;
  const scopeLabel = formatScopeLabel(data.scope, data.scope_params, symbol);

  const total = BigInt(data.cap_table.total);
  const now = Math.floor(Date.now() / 1000);
  const vested = data.schedule
    .filter((r) => r.unlock_timestamp <= now)
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const claimed = data.schedule
    .filter((r) => r.status === "claimed")
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const claimedRows = data.schedule.filter((r) => r.status === "claimed").length;
  const locked = total > vested ? total - vested : 0n;
  const beneficiaries = new Set(data.schedule.map((r) => r.beneficiary_wallet));
  const nextUnlock = data.schedule.find((r) => r.unlock_timestamp > now);

  return (
    <div className="min-h-screen bg-bg pb-20">
      <Banner data={data} scopeLabel={scopeLabel} />

      {data.scope === "monthly" && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-10 select-none text-[10px] uppercase tracking-[0.2em] text-text-subtle">
          MONTHLY SCOPE — CONFIDENTIAL
        </div>
      )}

      <main className="mx-auto max-w-container space-y-12 px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-mono lowercase text-[36px] leading-[1.1] tracking-tight text-text">
              {data.cap_table.project_name}
            </h1>
            <div className="flex items-center gap-3 text-sm text-text-muted">
              <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs">
                Read-only
              </span>
              <span>·</span>
              <span className="font-mono">{symbol}</span>
              <span className="font-mono text-text-subtle">
                {truncateAddress(data.cap_table.mint, 6)}
              </span>
              {data.cap_table.test_mode && (
                <>
                  <span>·</span>
                  <span className="text-warning">Test mode</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => downloadCsv(data, symbol, decimals)}
            >
              <Download size={14} />
              Download CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total in scope"
            value={
              <Money
                amount={total}
                mint={data.cap_table.mint}
                showSymbol={false}
                className="text-[32px] leading-tight"
              />
            }
            symbol={symbol}
            secondary={`${data.schedule.length} unlock event${data.schedule.length === 1 ? "" : "s"} across ${beneficiaries.size} beneficiar${beneficiaries.size === 1 ? "y" : "ies"}`}
          />
          <StatCard
            label="Vested to date"
            value={
              <Money
                amount={vested}
                mint={data.cap_table.mint}
                showSymbol={false}
                className="text-[32px] leading-tight"
              />
            }
            symbol={symbol}
            secondary={
              total === 0n
                ? "—"
                : `${(Number((vested * 10000n) / total) / 100).toFixed(1)}% of total`
            }
          />
          <StatCard
            label="Claimed"
            value={
              <Money
                amount={claimed}
                mint={data.cap_table.mint}
                showSymbol={false}
                className="text-[32px] leading-tight"
              />
            }
            symbol={symbol}
            secondary={`${claimedRows} of ${data.schedule.length} unlocks claimed`}
          />
          <StatCard
            label="Locked"
            value={
              <Money
                amount={locked}
                mint={data.cap_table.mint}
                showSymbol={false}
                className="text-[32px] leading-tight"
              />
            }
            symbol={symbol}
            secondary={
              nextUnlock
                ? `Next unlock ${formatRelative(new Date(nextUnlock.unlock_timestamp * 1000))}`
                : "All vested"
            }
          />
        </div>

        {/* Beneficiaries */}
        <Beneficiaries
          schedule={data.schedule}
          mint={data.cap_table.mint}
          decimals={decimals}
          symbol={symbol}
        />

        {/* Activity */}
        <Activity
          events={data.events}
          mint={data.cap_table.mint}
          decimals={decimals}
          symbol={symbol}
        />

        {/* Footer attestation */}
        <Footer
          data={data}
          keyHex={keyHex}
          keyDecimal={keyDecimal}
          scopeLabel={scopeLabel}
        />
      </main>
    </div>
  );
}

/* -- Banner --------------------------------------------------------------- */

function Banner({
  data,
  scopeLabel,
}: {
  data: DecryptResponse;
  scopeLabel: string;
}) {
  const expiresIn = data.expires_at
    ? formatRelative(new Date(data.expires_at))
    : null;
  const isMonthly = data.scope === "monthly";
  return (
    <div
      className="sticky top-0 z-20 border-b"
      style={{
        borderColor: "var(--border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        background: "var(--surface-glass, rgba(255,255,255,0.6))",
      }}
    >
      {isMonthly && (
        <div
          className="h-[1px] w-full"
          style={{ background: "var(--warning)" }}
        />
      )}
      <div className="mx-auto flex max-w-container items-center justify-between gap-4 px-6 py-3 text-sm">
        <div className="font-mono lowercase text-text">vest audit view</div>
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-text-muted">
          <span className="font-mono uppercase tracking-wider text-text-subtle">
            scope
          </span>
          <span className="text-text">{scopeLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="hidden sm:inline">{data.recipient_label}</span>
          {expiresIn && (
            <span className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-[11px] text-text-subtle">
              expires {expiresIn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Stats ---------------------------------------------------------------- */

function StatCard({
  label,
  value,
  symbol,
  secondary,
}: {
  label: string;
  value: React.ReactNode;
  symbol: string;
  secondary: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        {value}
        <span className="font-mono text-sm text-text-muted">{symbol}</span>
      </div>
      <span className="text-sm text-text-muted">{secondary}</span>
    </div>
  );
}

/* -- Beneficiaries -------------------------------------------------------- */

function Beneficiaries({
  schedule,
  mint,
  decimals,
  symbol,
}: {
  schedule: ScheduleRow[];
  mint: string;
  decimals: number;
  symbol: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const r of schedule) {
      const list = map.get(r.beneficiary_wallet) ?? [];
      list.push(r);
      map.set(r.beneficiary_wallet, list);
    }
    return [...map.entries()].map(([w, rows]) => ({
      wallet: w,
      rows: rows.sort((a, b) => a.unlock_timestamp - b.unlock_timestamp),
    }));
  }, [schedule]);

  if (grouped.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg tracking-h2 text-text">Beneficiaries</h2>
        <div className="rounded-md border border-border bg-surface-sunken px-4 py-6 text-sm text-text-muted">
          No beneficiaries fall within this scope.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg tracking-h2 text-text">Beneficiaries</h2>
        <span className="text-sm text-text-subtle">{grouped.length}</span>
      </div>
      <ul className="border-t border-border">
        {grouped.map((g) => (
          <BeneficiaryRow
            key={g.wallet}
            wallet={g.wallet}
            rows={g.rows}
            mint={mint}
            decimals={decimals}
            symbol={symbol}
          />
        ))}
      </ul>
    </section>
  );
}

function BeneficiaryRow({
  wallet,
  rows,
  mint,
  decimals,
  symbol,
}: {
  wallet: string;
  rows: ScheduleRow[];
  mint: string;
  decimals: number;
  symbol: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const allocation = rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const vested = rows
    .filter((r) => r.unlock_timestamp <= now)
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const claimed = rows
    .filter((r) => r.status === "claimed")
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const next = rows.find((r) => r.unlock_timestamp > now);
  const label = rows[0]?.beneficiary_label ?? "—";
  const timelineUnlocks: TimelineUnlock[] = rows.map((r) => ({
    id: r.id,
    unlock_timestamp: r.unlock_timestamp,
    amount: BigInt(r.amount),
    decimals,
    symbol,
    status: r.status,
    label: r.beneficiary_label,
  }));

  return (
    <li className="border-b border-border py-4">
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1.2fr_1fr_repeat(3,minmax(0,1fr))_auto]">
        <div className="min-w-0">
          <div className="text-sm text-text">{label}</div>
          <div className="text-xs text-text-subtle sm:hidden">
            <Address pubkey={wallet} chars={4} />
          </div>
        </div>
        <div className="hidden sm:block">
          <Address pubkey={wallet} chars={4} />
        </div>
        <Cell muted="Allocation">
          <Money amount={allocation} mint={mint} showSymbol={false} />
        </Cell>
        <Cell muted="Vested">
          <Money amount={vested} mint={mint} showSymbol={false} />
        </Cell>
        <Cell muted="Claimed">
          <Money amount={claimed} mint={mint} showSymbol={false} />
        </Cell>
        <div className="hidden text-sm text-text-muted sm:block">
          {next ? formatRelative(new Date(next.unlock_timestamp * 1000)) : "—"}
        </div>
      </div>
      <div className="mt-3">
        <ScheduleTimeline unlocks={timelineUnlocks} size="sm" showAmounts showToday />
      </div>
    </li>
  );
}

function Cell({
  muted,
  children,
}: {
  muted: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle sm:hidden">
        {muted}{" "}
      </span>
      <span className="font-mono text-text">{children}</span>
    </div>
  );
}

/* -- Activity ------------------------------------------------------------- */

function Activity({
  events,
  decimals,
  symbol,
}: {
  events: Ev[];
  mint: string;
  decimals: number;
  symbol: string;
}) {
  if (events.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg tracking-h2 text-text">Activity</h2>
        <div className="rounded-md border border-border bg-surface-sunken px-4 py-6 text-sm text-text-muted">
          No activity in this scope yet.
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg tracking-h2 text-text">Activity</h2>
      <ul className="border-t border-border">
        {events.map((e, i) => (
          <ActivityRow
            key={`${e.kind}-${e.at}-${i}`}
            event={e}
            decimals={decimals}
            symbol={symbol}
          />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({
  event,
  decimals,
  symbol,
}: {
  event: Ev;
  decimals: number;
  symbol: string;
}) {
  const { Icon, text } = renderActivity(event, decimals, symbol);
  const date = new Date(event.at);
  return (
    <li className="flex items-start gap-3 border-b border-border py-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
        <Icon size={12} />
      </span>
      <div className="flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <Timestamp date={date} className="text-xs" />
          <span className="text-text">{text}</span>
        </div>
        {event.signature && (
          <a
            href={solscanUrl(event.signature)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-accent hover:underline"
          >
            {truncateAddress(event.signature, 6)} ↗
          </a>
        )}
      </div>
    </li>
  );
}

function renderActivity(
  e: Ev,
  decimals: number,
  symbol: string,
): { Icon: typeof Shield; text: string } {
  switch (e.kind) {
    case "treasury_shielded": {
      const amount = formatAmount(BigInt(e.data.amount ?? "0"), decimals);
      return {
        Icon: Shield,
        text: `Treasury shielded — ${amount} ${symbol}`,
      };
    }
    case "utxo_created": {
      const amount = formatAmount(BigInt(e.data.amount ?? "0"), decimals);
      const label = e.data.beneficiary_label ?? "—";
      return {
        Icon: Coins,
        text: `Unlock UTXO created: ${label} — ${amount} ${symbol}`,
      };
    }
    case "utxo_claimed": {
      const amount = formatAmount(BigInt(e.data.amount ?? "0"), decimals);
      const label = e.data.beneficiary_label ?? "—";
      return {
        Icon: WalletIcon,
        text: `Unlock claimed: ${label} — ${amount} ${symbol}`,
      };
    }
    case "viewing_key_issued":
      return {
        Icon: KeyRound,
        text: `Viewing key issued: ${e.data.scope ?? "—"} — ${e.data.recipient ?? "—"}`,
      };
    case "viewing_key_revoked":
      return {
        Icon: KeyRound,
        text: `Viewing key revoked: ${e.data.recipient ?? "—"}`,
      };
    case "viewing_key_accessed":
      return {
        Icon: KeyRound,
        text: `Viewing key accessed: ${e.data.recipient ?? "—"}`,
      };
  }
}

/* -- Footer --------------------------------------------------------------- */

function Footer({
  data,
  keyHex,
  keyDecimal,
  scopeLabel,
}: {
  data: DecryptResponse;
  keyHex: string | null;
  keyDecimal: string | null;
  scopeLabel: string;
}) {
  const [showVerify, setShowVerify] = useState(false);
  return (
    <footer className="space-y-3 rounded-lg border border-border bg-surface-sunken p-5 text-xs text-text-muted">
      <div>
        Generated by Vest from a viewing key issued by{" "}
        <span className="font-mono text-text">
          {truncateAddress(data.cap_table.founder_wallet, 6)}
        </span>
        . Underlying transactions anchored on Solana via the Umbra mixer.
      </div>
      <div>
        Cap-table commitment:{" "}
        <span className="font-mono break-all text-text-subtle">
          {data.cap_table.commitment}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Issued <Timestamp date={new Date(data.issued_at)} />
        </span>
        <span>·</span>
        <span>
          Scope <span className="text-text">{scopeLabel}</span>
        </span>
        {data.expires_at && (
          <>
            <span>·</span>
            <span>
              Expires <Timestamp date={new Date(data.expires_at)} />
            </span>
          </>
        )}
      </div>
      {keyHex && (
        <details className="text-text-subtle">
          <summary className="cursor-pointer">
            Show derived viewing key (BN254)
          </summary>
          <div className="mt-2 space-y-1 break-all">
            <div className="font-mono">hex: {keyHex}</div>
            {keyDecimal && (
              <div className="font-mono">decimal: {keyDecimal}</div>
            )}
          </div>
        </details>
      )}
      <button
        type="button"
        onClick={() => setShowVerify(true)}
        className="text-accent underline-offset-2 hover:underline"
      >
        Verify on Solscan
      </button>
      {showVerify && (
        <VerifyModal
          data={data}
          onClose={() => setShowVerify(false)}
        />
      )}
    </footer>
  );
}

function VerifyModal({
  data,
  onClose,
}: {
  data: DecryptResponse;
  onClose: () => void;
}) {
  const sig = data.cap_table.shield_tx_signature;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.3)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-xl border border-border bg-surface p-6 text-sm"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <h3 className="text-lg tracking-h2 text-text">Verify on Solscan</h3>
        <p className="mt-2 text-text-muted">
          The Vest audit view is rendered from our cap-table mirror. To verify
          the underlying treasury was actually shielded on-chain, look up the
          shield transaction on Solscan and confirm the deposit destination
          matches the founder&rsquo;s wallet.
        </p>
        {sig ? (
          <div className="mt-3 space-y-2">
            <div className="break-all rounded bg-surface-sunken px-2 py-1.5 font-mono text-xs">
              {sig}
            </div>
            <a
              href={solscanUrl(sig)}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-accent hover:underline"
            >
              Open on Solscan ↗
            </a>
          </div>
        ) : (
          <div className="mt-3 text-xs text-text-subtle">
            Treasury hasn&rsquo;t been shielded yet — no signature to verify.
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -- CSV ------------------------------------------------------------------ */

function downloadCsv(
  data: DecryptResponse,
  symbol: string,
  decimals: number,
) {
  const headers = [
    "beneficiary_label",
    "beneficiary_wallet",
    "unlock_timestamp",
    "amount",
    "amount_human",
    "mint",
    "status",
    "claimed_at",
    "claim_tx",
  ];
  const rows = data.schedule.map((r) => [
    csvEscape(r.beneficiary_label),
    r.beneficiary_wallet,
    new Date(r.unlock_timestamp * 1000).toISOString(),
    r.amount,
    formatAmount(BigInt(r.amount), decimals),
    data.cap_table.mint,
    r.status,
    r.claimed_at ?? "",
    r.claim_tx_signature ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.cap_table.project_name.replace(/\W+/g, "-")}-audit-${data.scope}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  void symbol;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
