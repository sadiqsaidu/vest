"use client";

import { forwardRef, useRef, useImperativeHandle } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: React.ReactNode;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  showSteppers?: boolean;
};

/**
 * Polished number input. Strips native browser arrows (which are inconsistent
 * across browsers and visually noisy) and gives an optional pair of +/- step
 * buttons, plus a right-aligned unit suffix (USDC, mo, etc.).
 */
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  {
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix,
    placeholder = "0",
    className,
    inputClassName,
    ariaLabel,
    disabled,
    showSteppers = false,
  },
  ref,
) {
  const internal = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => internal.current!, []);

  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  const adjust = (delta: number) => {
    const n = Number(value || "0");
    if (Number.isNaN(n)) return;
    onChange(String(clamp(n + delta)));
    internal.current?.focus();
  };

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md border border-border bg-surface-sunken transition-colors focus-within:border-border-strong",
        disabled && "opacity-60",
        className,
      )}
    >
      {showSteppers && (
        <button
          type="button"
          aria-label="Decrement"
          tabIndex={-1}
          onClick={() => adjust(-step)}
          disabled={disabled}
          className="flex h-10 w-9 shrink-0 items-center justify-center text-text-subtle hover:text-text"
        >
          <Minus size={12} />
        </button>
      )}
      <input
        ref={internal}
        type="text"
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // Allow empty / digits / one decimal point.
          if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
        }}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        className={cn(
          "vest-number h-10 min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none placeholder:text-text-subtle",
          showSteppers && "px-2 text-center",
          inputClassName,
        )}
      />
      {suffix && (
        <span className="pointer-events-none flex shrink-0 items-center pr-3 font-mono text-xs text-text-subtle">
          {suffix}
        </span>
      )}
      {showSteppers && (
        <button
          type="button"
          aria-label="Increment"
          tabIndex={-1}
          onClick={() => adjust(step)}
          disabled={disabled}
          className="flex h-10 w-9 shrink-0 items-center justify-center text-text-subtle hover:text-text"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
});
