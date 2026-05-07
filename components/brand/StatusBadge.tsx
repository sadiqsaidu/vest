import { cn } from "@/lib/utils";

export type ShieldStatus =
  | "pending"
  | "shielded"
  | "utxos_ready"
  | "partially_claimed"
  | "fully_claimed";

const LABELS: Record<ShieldStatus, string> = {
  pending: "Pending shield",
  shielded: "Shielded",
  utxos_ready: "UTXOs ready",
  partially_claimed: "Partially claimed",
  fully_claimed: "Fully claimed",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ShieldStatus;
  className?: string;
}) {
  const styles: Record<ShieldStatus, string> = {
    pending: "border-border text-text-muted",
    shielded: "border-text text-text",
    utxos_ready: "border-success text-success",
    partially_claimed: "border-warning text-warning",
    fully_claimed: "border-success bg-success text-accent-fg",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs",
        styles[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
