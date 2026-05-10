"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: React.ReactNode;
  hint?: React.ReactNode;
};

/**
 * Segmented control — a pill-style toggle for a small enumeration. Replaces
 * inconsistent ad-hoc button rows. The selected segment slides into place via
 * a CSS transition on the indicator span.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const heightClass = size === "sm" ? "h-8" : "h-10";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex select-none items-stretch rounded-md border border-border bg-surface-sunken p-1",
        heightClass,
        className,
      )}
      style={{ ["--seg-count" as any]: options.length, ["--seg-idx" as any]: idx }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded transition-transform duration-200 ease-out"
        style={{
          left: 4,
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(calc(${idx} * 100%))`,
          background: "var(--surface)",
          boxShadow: "var(--shadow-sm)",
        }}
      />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-[1] flex flex-1 items-center justify-center gap-1.5 px-4 text-sm transition-colors",
              size === "sm" && "px-3 text-xs",
              selected ? "text-text" : "text-text-muted hover:text-text",
            )}
          >
            {o.label}
            {o.hint && (
              <span className="font-mono text-[10px] text-text-subtle">
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
