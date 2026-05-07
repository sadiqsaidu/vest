"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  ChevronDown,
  Coins,
  KeyRound,
  Shield,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/primitives/Money";
import { Address } from "@/components/primitives/Address";
import { Timestamp } from "@/components/primitives/Timestamp";
import { Skeleton } from "@/components/primitives/Skeleton";
import {
  ScheduleTimeline,
  type TimelineUnlock,
} from "@/components/primitives/ScheduleTimeline";
import { tokenByMint, tokenSymbolFromMint } from "@/lib/tokens";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { cn, formatAmount, formatRelative, truncateAddress } from "@/lib/utils";

type ShieldStatus =
  | "pending"
  | "shielded"
  | "utxos_created"
  | "partially_claimed"
  | "fully_claimed";

type DisplayStatus =
  | "pending"
  | "shielded"
  | "active"
  | "partially_claimed"
  | "fully_claimed";

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pending shield",
  shielded: "Shielded",
  active: "Active",
  partially_claimed: "Partially claimed",
  fully_claimed: "Fully claimed",
};

type CapTable = {
  id: string;
  founder_wallet: string;
  project_name: string;
  mint: string;
  total: string;
  shield_status: ShieldStatus;
  shield_tx_signature?: string | null;
  test_mode: boolean;
  created_at: string;
};

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

type ActivityEvent = {
  kind:
    | "treasury_shielded"
    | "utxo_created"
    | "utxo_claimed"
    | "viewing_key_issued"
    | "viewing_key_revoked";
  at: string;
  signature?: string | null;
  data: Record<string, any>;
};

const SOLSCAN = "https://solscan.io/tx/";
const CLUSTER = "?cluster=devnet";

function solscanUrl(sig: string) {
  return `${SOLSCAN}${sig}${CLUSTER}`;
}

export function DashboardView({ id }: { id: string }) {
  const wallet = useWallet();
  const [data, setData] = useState<{
    cap_table: CapTable;
    schedule: ScheduleRow[];
  } | null>(null);
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "read_cap_table");
        const [resCT, resAct] = await Promise.all([
          fetch(`/api/cap-tables/${id}`, { headers: authHeaders(auth) }),
          fetch(`/api/cap-tables/${id}/activity`, {
            headers: authHeaders(auth),
          }),
        ]);
        if (!resCT.ok) throw new Error(`HTTP ${resCT.status}`);
        const ct = await resCT.json();
        const act = resAct.ok ? await resAct.json() : { events: [] };
        if (cancelled) return;
        setData(ct);
        setEvents(act.events ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58(), id]);

  if (error) {
    return (
      <div className="mx-auto max-w-container px-6 py-10 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!data) {
    return <DashboardSkeleton />;
  }

  const { cap_table: ct, schedule } = data;
  const tok = tokenByMint(ct.mint);
  const symbol = tok?.symbol ?? tokenSymbolFromMint(ct.mint);
  const decimals = tok?.decimals ?? 6;
  const total = BigInt(ct.total);
  const now = Math.floor(Date.now() / 1000);

  const vested = schedule
    .filter((r) => r.unlock_timestamp <= now)
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const claimed = schedule
    .filter((r) => r.status === "claimed")
    .reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const claimedRows = schedule.filter((r) => r.status === "claimed").length;
  const locked = total > vested ? total - vested : 0n;
  const beneficiaries = new Set(schedule.map((r) => r.beneficiary_wallet));
  const nextUnlock = schedule.find((r) => r.unlock_timestamp > now);

  const displayStatus = deriveDisplayStatus(ct.shield_status, schedule);
  const vestedPct =
    total === 0n ? 0 : Number((vested * 10000n) / total) / 100;

  return (
    <div className="mx-auto max-w-container px-6 py-10 space-y-12">
      {/* SECTION 1 — HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono lowercase text-[36px] leading-[1.1] tracking-tight text-text">
            {ct.project_name}
          </h1>
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <StatusPill status={displayStatus} />
            <span>·</span>
            <span className="font-mono">{symbol}</span>
            <span className="font-mono text-text-subtle">
              {truncateAddress(ct.mint, 6)}
            </span>
            {ct.test_mode && (
              <>
                <span>·</span>
                <span className="text-warning">Test mode</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ct.shield_status === "pending" && (
            <Link href={`/dashboard/${ct.id}/shield`}>
              <Button>Shield treasury</Button>
            </Link>
          )}
          <Link href={`/dashboard/${ct.id}/viewing-keys`}>
            <Button variant="ghost">
              <KeyRound size={14} />
              Generate viewing key
            </Button>
          </Link>
        </div>
      </div>

      {/* SECTION 2 — STATS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total committed"
          value={
            <Money
              amount={total}
              mint={ct.mint}
              showSymbol={false}
              className="text-[32px] leading-tight"
            />
          }
          symbol={symbol}
          secondary={`${schedule.length} unlock event${schedule.length === 1 ? "" : "s"} across ${beneficiaries.size} beneficiar${beneficiaries.size === 1 ? "y" : "ies"}`}
        />
        <StatCard
          label="Vested to date"
          value={
            <Money
              amount={vested}
              mint={ct.mint}
              showSymbol={false}
              className="text-[32px] leading-tight"
            />
          }
          symbol={symbol}
          secondary={`${vestedPct.toFixed(1)}% of total`}
        />
        <StatCard
          label="Claimed"
          value={
            <Money
              amount={claimed}
              mint={ct.mint}
              showSymbol={false}
              className="text-[32px] leading-tight"
            />
          }
          symbol={symbol}
          secondary={`${claimedRows} of ${schedule.length} unlock${schedule.length === 1 ? "" : "s"} claimed`}
        />
        <StatCard
          label="Locked"
          value={
            <Money
              amount={locked}
              mint={ct.mint}
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

      {/* SECTION 3 — BENEFICIARIES */}
      <Beneficiaries
        schedule={schedule}
        mint={ct.mint}
        decimals={decimals}
        symbol={symbol}
      />

      {/* SECTION 4 — ACTIVITY */}
      <Activity events={events} mint={ct.mint} decimals={decimals} symbol={symbol} />

      {/* SECTION 5 — VIEWING KEYS (empty state for now) */}
      <ViewingKeys capTableId={ct.id} />
    </div>
  );
}

/* -----------------------------------------------------------------------
 * Stats card
 * ---------------------------------------------------------------------*/

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

/* -----------------------------------------------------------------------
 * Status pill
 * ---------------------------------------------------------------------*/

function StatusPill({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    pending: "border-border text-text-muted",
    shielded: "border-border text-text",
    active: "border-success text-success",
    partially_claimed: "border-warning text-warning",
    fully_claimed: "border-success bg-success text-accent-fg",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs",
        styles[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function deriveDisplayStatus(
  shield_status: ShieldStatus,
  rows: ScheduleRow[],
): DisplayStatus {
  if (shield_status === "pending") return "pending";
  if (shield_status === "shielded") return "shielded";
  // From here, UTXOs have been created.
  if (rows.length === 0) return "active";
  const claimed = rows.filter((r) => r.status === "claimed").length;
  if (claimed === 0) return "active";
  if (claimed === rows.length) return "fully_claimed";
  return "partially_claimed";
}

/* -----------------------------------------------------------------------
 * Beneficiaries
 * ---------------------------------------------------------------------*/

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
        <SectionHeading title="Beneficiaries" count={0} />
        <EmptyState>No beneficiaries yet.</EmptyState>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeading title="Beneficiaries" count={grouped.length} />
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
  const [open, setOpen] = useState(false);
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
    <li className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "grid w-full grid-cols-1 items-center gap-3 py-4 text-left",
          "sm:grid-cols-[1.2fr_1fr_repeat(3,minmax(0,1fr))_auto]",
          "hover:bg-surface-sunken/40 transition-colors px-1 -mx-1 rounded",
        )}
      >
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
          {next
            ? formatRelative(new Date(next.unlock_timestamp * 1000))
            : "—"}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "ml-auto text-text-subtle transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-1 pb-5 pt-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-subtle sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 font-mono">
                  <span>{formatAmount(BigInt(r.amount), decimals)}</span>
                  <span className="text-[10px] text-text-subtle">{symbol}</span>
                </div>
              ))}
            </div>
            <ScheduleTimeline
              unlocks={timelineUnlocks}
              size="sm"
              showAmounts
              showToday
            />
          </div>
        </div>
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

/* -----------------------------------------------------------------------
 * Activity
 * ---------------------------------------------------------------------*/

function Activity({
  events,
  mint,
  decimals,
  symbol,
}: {
  events: ActivityEvent[] | null;
  mint: string;
  decimals: number;
  symbol: string;
}) {
  const [shown, setShown] = useState(10);

  if (events === null) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm tracking-h2 text-text-muted">Activity</h2>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm tracking-h2 text-text-muted">Activity</h2>
        <EmptyState>Nothing has happened yet.</EmptyState>
      </section>
    );
  }

  const visible = events.slice(0, shown);
  const more = events.length - shown;

  return (
    <section className="space-y-3">
      <h2 className="text-sm tracking-h2 text-text-muted">Activity</h2>
      <ul className="border-t border-border">
        {visible.map((e, i) => (
          <ActivityRow
            key={`${e.kind}-${e.at}-${i}`}
            event={e}
            mint={mint}
            decimals={decimals}
            symbol={symbol}
          />
        ))}
      </ul>
      {more > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShown((s) => s + 10)}
            className="text-sm text-text-muted underline-offset-2 hover:underline"
          >
            Show {Math.min(more, 10)} more
          </button>
        </div>
      )}
    </section>
  );
}

function ActivityRow({
  event,
  decimals,
  symbol,
}: {
  event: ActivityEvent;
  mint: string;
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
  e: ActivityEvent,
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
  }
}

/* -----------------------------------------------------------------------
 * Viewing keys (empty state for now)
 * ---------------------------------------------------------------------*/

function ViewingKeys({ capTableId }: { capTableId: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm tracking-h2 text-text-muted">Viewing keys</h2>
        <Link href={`/dashboard/${capTableId}/viewing-keys`}>
          <Button size="sm" variant="ghost">
            <KeyRound size={12} />
            Generate
          </Button>
        </Link>
      </div>
      <EmptyState>
        No viewing keys issued. Issue a key to share read access with auditors,
        lawyers, or beneficiaries&rsquo; tax preparers.
      </EmptyState>
    </section>
  );
}

/* -----------------------------------------------------------------------
 * Skeleton + empty state
 * ---------------------------------------------------------------------*/

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-container px-6 py-10 space-y-12">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface p-5 space-y-3 shadow-sm"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-sunken px-4 py-6 text-sm text-text-muted">
      {children}
    </div>
  );
}

function SectionHeading({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-lg tracking-h2 text-text">{title}</h2>
      <span className="text-sm text-text-subtle">{count}</span>
    </div>
  );
}
