import { cn, formatAmount, getTokenDecimals, getTokenSymbol } from "@/lib/utils";

type MoneyProps = {
  amount: bigint;
  mint: string;
  showSymbol?: boolean;
  className?: string;
};

export function Money({ amount, mint, showSymbol = true, className }: MoneyProps) {
  const decimals = getTokenDecimals(mint);
  const value = formatAmount(amount, decimals);
  const symbol = getTokenSymbol(mint);
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {value}
      {showSymbol && <span className="text-text-muted ml-1.5">{symbol}</span>}
    </span>
  );
}
