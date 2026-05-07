import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TOKEN_DECIMALS: Record<string, number> = {};

export function getTokenDecimals(mint: string): number {
  return TOKEN_DECIMALS[mint] ?? 6;
}

export function getTokenSymbol(mint: string): string {
  const usdc = process.env.NEXT_PUBLIC_USDC_MINT;
  if (usdc && mint === usdc) return "USDC";
  return mint.slice(0, 4);
}

export function formatAmount(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
  return negative ? `-${out}` : out;
}

export function truncateAddress(pubkey: string, chars = 4): string {
  if (pubkey.length <= chars * 2 + 1) return pubkey;
  return `${pubkey.slice(0, chars)}…${pubkey.slice(-chars)}`;
}

export function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec > 0;

  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];

  let value = abs;
  let unit = "second";
  for (const [step, name] of units) {
    if (value < step) {
      unit = name;
      break;
    }
    value /= step;
    unit = name;
  }
  const rounded = Math.round(value);
  const plural = rounded === 1 ? "" : "s";
  return future ? `in ${rounded} ${unit}${plural}` : `${rounded} ${unit}${plural} ago`;
}
