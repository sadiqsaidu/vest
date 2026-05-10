"use client";

import bs58 from "bs58";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export type AuthSig = {
  wallet: string;
  message: string;
  signature: string;
};

// One reusable session token instead of one signMessage per page navigation.
// Wallets normally surface signMessage as a friction-free prompt, but Phantom
// (in particular) shows a full approval modal each time. We sign once per
// session per wallet and cache in sessionStorage; the server keeps verifying
// the same Ed25519 signature against the message it ships with each request.
const STORAGE_PREFIX = "vest:auth:v1:";
const SESSION_LABEL = "session";

function storageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress}`;
}

function loadCached(walletAddress: string): AuthSig | null {
  try {
    const raw = sessionStorage.getItem(storageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSig;
    if (
      parsed?.wallet === walletAddress &&
      typeof parsed.message === "string" &&
      typeof parsed.signature === "string"
    ) {
      return parsed;
    }
  } catch {
    /* sessionStorage unavailable / malformed entry */
  }
  return null;
}

function persist(auth: AuthSig): void {
  try {
    sessionStorage.setItem(storageKey(auth.wallet), JSON.stringify(auth));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function clearSessionAuth(walletAddress?: string) {
  try {
    if (walletAddress) {
      sessionStorage.removeItem(storageKey(walletAddress));
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

// `_action` is retained as a callsite breadcrumb (read me at grep time);
// the server doesn't bind to it. We sign one message per session and reuse
// it for every API call.
export async function signAuth(
  wallet: WalletContextState,
  _action: string,
): Promise<AuthSig> {
  void _action;
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Wallet does not support signMessage");
  }
  const address = wallet.publicKey.toBase58();
  const cached = loadCached(address);
  if (cached) return cached;

  // Long-lived nonce — survives the whole tab session. Server only verifies
  // the signature is valid for this message + this pubkey; freshness is left
  // to the caller's threat model. (We're authenticating a wallet to its own
  // founder/beneficiary records, not authorising a financial action.)
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const message = `vest:auth:${SESSION_LABEL}:${nonce}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(message));
  const auth: AuthSig = {
    wallet: address,
    message,
    signature: bs58.encode(sig),
  };
  persist(auth);
  return auth;
}

export function authHeaders(a: AuthSig): HeadersInit {
  return {
    "x-vest-wallet": a.wallet,
    "x-vest-message": a.message,
    "x-vest-signature": a.signature,
  };
}
