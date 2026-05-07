import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type StatProps = {
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
  className?: string;
};

export function Stat({ label, value, secondary, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-5",
        className,
      )}
    >
      <span className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <span className="font-mono text-2xl text-text">{value}</span>
      {secondary && (
        <span className="text-sm text-text-muted">{secondary}</span>
      )}
    </div>
  );
}
