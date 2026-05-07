export type TokenSymbol = "USDC" | "SOL";

export type TokenConfig = {
  symbol: TokenSymbol;
  mint: string;
  decimals: number;
};

const USDC_MINT_DEVNET =
  process.env.NEXT_PUBLIC_USDC_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const TOKENS: Record<TokenSymbol, TokenConfig> = {
  USDC: { symbol: "USDC", mint: USDC_MINT_DEVNET, decimals: 6 },
  SOL: { symbol: "SOL", mint: WSOL_MINT, decimals: 9 },
};

export function tokenByMint(mint: string): TokenConfig | null {
  for (const t of Object.values(TOKENS)) if (t.mint === mint) return t;
  return null;
}

export function tokenSymbolFromMint(mint: string): string {
  return tokenByMint(mint)?.symbol ?? mint.slice(0, 4);
}
