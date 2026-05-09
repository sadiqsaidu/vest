"use client";

import {
  getMasterViewingKeyDeriver,
  getMintViewingKeyDeriver,
  getYearlyViewingKeyDeriver,
  getMonthlyViewingKeyDeriver,
} from "@umbra-privacy/sdk";

export type ViewingKeyScope = "master" | "mint" | "yearly" | "monthly";

export type ViewingKeyScopeParams = {
  mint?: string;
  year?: number;
  month?: number;
};

export type ViewingKeyResult = {
  /** 0x-prefixed 64-hex-char string. 32-byte big-endian BN254 element. */
  keyHex: string;
  /** Decimal `bigint` string. Lossless, matches Umbra docs export format. */
  keyDecimal: string;
  /** Raw 32-byte buffer. Used as the inner plaintext for envelope wrapping. */
  keyBytes: Uint8Array;
  /** Scope tag stored alongside the envelope for display + audit filtering. */
  scope: ViewingKeyScope;
  scopeParams: ViewingKeyScopeParams;
};

function bnToBytesBE(value: bigint, length = 32): Uint8Array {
  if (value < 0n) throw new Error("Negative bigint");
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("bigint exceeds buffer length");
  return out;
}

function bnToHex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

function pack(value: bigint, scope: ViewingKeyScope, scopeParams: ViewingKeyScopeParams): ViewingKeyResult {
  return {
    keyBytes: bnToBytesBE(value, 32),
    keyHex: bnToHex(value),
    keyDecimal: value.toString(),
    scope,
    scopeParams,
  };
}

/**
 * Derive the master viewing key from the founder's master seed.
 * If the seed has not been derived yet, this triggers a wallet signMessage
 * prompt (UMBRA_MESSAGE_TO_SIGN). After registration / shield in the same
 * session, no extra prompts are needed.
 */
export async function generateMasterKey(client: any): Promise<ViewingKeyResult> {
  const derive = getMasterViewingKeyDeriver({ client });
  const mvk = (await derive()) as unknown as bigint;
  return pack(mvk, "master", {});
}

export async function generateMintKey(
  client: any,
  mint: string,
): Promise<ViewingKeyResult> {
  const derive = getMintViewingKeyDeriver({ client });
  const k = (await derive(mint as any)) as unknown as bigint;
  return pack(k, "mint", { mint });
}

export async function generateYearlyKey(
  client: any,
  mint: string,
  year: number,
): Promise<ViewingKeyResult> {
  const derive = getYearlyViewingKeyDeriver({ client });
  const k = (await derive(
    mint as any,
    BigInt(year) as any,
  )) as unknown as bigint;
  return pack(k, "yearly", { mint, year });
}

export async function generateMonthlyKey(
  client: any,
  mint: string,
  year: number,
  month: number,
): Promise<ViewingKeyResult> {
  const derive = getMonthlyViewingKeyDeriver({ client });
  const k = (await derive(
    mint as any,
    BigInt(year) as any,
    BigInt(month) as any,
  )) as unknown as bigint;
  return pack(k, "monthly", { mint, year, month });
}

/**
 * Format a scope into a short label like "Master" / "USDC" / "2025" / "Feb 2025".
 */
export function formatScopeLabel(
  scope: ViewingKeyScope,
  params: ViewingKeyScopeParams,
  mintSymbol?: string,
): string {
  switch (scope) {
    case "master":
      return "Master";
    case "mint":
      return mintSymbol ?? "Token";
    case "yearly":
      return `${params.year ?? "—"}`;
    case "monthly": {
      if (!params.year || !params.month) return "—";
      const monthName = new Date(params.year, params.month - 1, 1).toLocaleString(
        undefined,
        { month: "short" },
      );
      return `${monthName} ${params.year}`;
    }
  }
}
