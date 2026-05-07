"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import type { ReactNode } from "react";
import { Address } from "@/components/primitives/Address";

export function RequireWallet({ children }: { children: ReactNode }) {
  const { connected, publicKey } = useWallet();

  if (!connected || !publicKey) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl tracking-h2 text-text">Connect a wallet</h1>
        <p className="max-w-[420px] text-[15px] text-text-muted">
          Vest is on Solana devnet. Connect Phantom, Solflare, or Backpack to
          continue.
        </p>
        <div className="mt-2">
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-container items-center justify-between px-6 py-3 text-sm">
          <span className="text-text-muted">Connected</span>
          <Address pubkey={publicKey.toBase58()} />
        </div>
      </div>
      {children}
    </>
  );
}
