"use client";

import { useMemo, useState } from "react";
import { cn, formatAmount } from "@/lib/utils";

export type TimelineUnlock = {
  id: string;
  unlock_timestamp: number; // unix seconds
  amount: bigint;
  decimals: number;
  symbol: string;
  status: "scheduled" | "utxo_created" | "claimed";
  label?: string;
};

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { h: number; r: number; pad: number }> = {
  sm: { h: 60, r: 4, pad: 12 },
  md: { h: 96, r: 5, pad: 16 },
  lg: { h: 128, r: 6, pad: 20 },
};

export function ScheduleTimeline({
  unlocks,
  size = "md",
  showAmounts = true,
  showToday = true,
}: {
  unlocks: TimelineUnlock[];
  size?: Size;
  showAmounts?: boolean;
  showToday?: boolean;
}) {
  const cfg = SIZE[size];
  const now = Math.floor(Date.now() / 1000);
  const sorted = useMemo(
    () => [...unlocks].sort((a, b) => a.unlock_timestamp - b.unlock_timestamp),
    [unlocks],
  );

  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);

  if (sorted.length === 0) {
    return null;
  }

  const tMin = sorted[0].unlock_timestamp;
  const tMax = sorted[sorted.length - 1].unlock_timestamp;
  // Avoid divide-by-zero on single-event schedules.
  const span = Math.max(tMax - tMin, 1);

  // Ensure "today" still falls inside the visible viewport even if it's beyond
  // the schedule range.
  const visMin = Math.min(tMin, showToday ? now : tMin);
  const visMax = Math.max(tMax, showToday ? now : tMax);
  const visSpan = Math.max(visMax - visMin, 1);

  const widthPct = (t: number) =>
    sorted.length === 1
      ? 50
      : ((t - visMin) / visSpan) * 100;

  const anyClaimable = sorted.some(
    (u) => u.unlock_timestamp <= now && u.status !== "claimed",
  );

  return (
    <div
      className="relative w-full select-none"
      style={{ height: cfg.h }}
      role="img"
      aria-label="Vesting schedule timeline"
    >
      <svg
        viewBox={`0 0 1000 ${cfg.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Baseline */}
        <line
          x1={cfg.pad}
          x2={1000 - cfg.pad}
          y1={cfg.h / 2}
          y2={cfg.h / 2}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* Today indicator */}
        {showToday && now >= visMin && now <= visMax && (
          <g>
            <line
              x1={cfg.pad + ((1000 - 2 * cfg.pad) * widthPct(now)) / 100}
              x2={cfg.pad + ((1000 - 2 * cfg.pad) * widthPct(now)) / 100}
              y1={6}
              y2={cfg.h - 6}
              stroke="var(--text-subtle)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>
        )}
      </svg>

      {/* Today label (HTML so font + tabular-nums work) */}
      {showToday && now >= visMin && now <= visMax && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 font-mono text-[10px] text-text-subtle"
          style={{
            left: `calc(${cfg.pad}px + (100% - ${2 * cfg.pad}px) * ${widthPct(now) / 100})`,
            bottom: 2,
          }}
        >
          today
        </div>
      )}

      {/* Dots */}
      <div
        className="absolute inset-x-0 top-1/2"
        style={{ paddingLeft: cfg.pad, paddingRight: cfg.pad }}
      >
        {sorted.map((u, i) => {
          const isPast = u.unlock_timestamp <= now;
          const isClaimed = u.status === "claimed";
          const claimable = isPast && !isClaimed;
          const future = !isPast;

          const left = `${widthPct(u.unlock_timestamp)}%`;

          return (
            <button
              key={u.id}
              type="button"
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
                "outline-none focus-visible:ring-2 focus-visible:ring-accent",
                claimable && anyClaimable && "animate-pulse",
              )}
              style={{
                left,
                width: cfg.r * 2,
                height: cfg.r * 2,
                backgroundColor: isClaimed
                  ? "var(--success)"
                  : claimable
                    ? "var(--text)"
                    : "transparent",
                border: future
                  ? "1.5px solid var(--border-strong)"
                  : claimable
                    ? "1.5px solid var(--text)"
                    : "none",
              }}
              onMouseEnter={() => setHover({ x: widthPct(u.unlock_timestamp), idx: i })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ x: widthPct(u.unlock_timestamp), idx: i })}
              onBlur={() => setHover(null)}
              aria-label={`Unlock ${i + 1}: ${formatAmount(u.amount, u.decimals)} ${u.symbol} on ${formatDate(u.unlock_timestamp)}`}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {hover && (
        <Tooltip
          unlock={sorted[hover.idx]}
          x={hover.x}
          showAmounts={showAmounts}
          containerHeight={cfg.h}
        />
      )}
    </div>
  );
}

function Tooltip({
  unlock,
  x,
  showAmounts,
  containerHeight,
}: {
  unlock: TimelineUnlock;
  x: number;
  showAmounts: boolean;
  containerHeight: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
      style={{
        left: `${x}%`,
        top: containerHeight / 2 - 64,
      }}
    >
      <div className="font-mono text-text">
        {formatDate(unlock.unlock_timestamp)}
      </div>
      {showAmounts && (
        <div className="font-mono text-text-muted">
          {formatAmount(unlock.amount, unlock.decimals)} {unlock.symbol}
        </div>
      )}
      {unlock.label && (
        <div className="text-text-subtle">{unlock.label}</div>
      )}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
