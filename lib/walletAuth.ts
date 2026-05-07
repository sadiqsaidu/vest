"use client";

import bs58 from "bs58";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export async function signAuth(
  wallet: WalletContextState,
  action: string,
): Promise<{ wallet: string; message: string; signature: string }> {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Wallet does not support signMessage");
  }
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const message = `vest:auth:${action}:${nonce}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(message));
  return {
    wallet: wallet.publicKey.toBase58(),
    message,
    signature: bs58.encode(sig),
  };
}

export function authHeaders(a: {
  wallet: string;
  message: string;
  signature: string;
}): HeadersInit {
  return {
    "x-vest-wallet": a.wallet,
    "x-vest-message": a.message,
    "x-vest-signature": a.signature,
  };
}
