"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type UmbraClient = unknown;

export type UmbraClientState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; client: UmbraClient }
  | { status: "error"; error: string };

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as
  | "mainnet"
  | "devnet"
  | "localnet";

const INDEXER =
  process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL ??
  "https://utxo-indexer.api-devnet.umbraprivacy.com";

export function useUmbraClient(): UmbraClientState {
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<UmbraClientState>({ status: "idle" });
  const buildingFor = useRef<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setState({ status: "idle" });
      buildingFor.current = null;
      return;
    }
    const addr = publicKey.toBase58();
    if (buildingFor.current === addr) return;
    buildingFor.current = addr;

    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const [{ getWallets }, { getUmbraClient, createSignerFromWalletAccount }] =
          await Promise.all([
            import("@wallet-standard/app"),
            import("@umbra-privacy/sdk"),
          ]);

        const wallets = getWallets().get();
        let match: { wallet: any; account: any } | null = null;
        for (const w of wallets) {
          const features = Object.keys(w.features ?? {});
          if (
            !features.includes("solana:signTransaction") ||
            !features.includes("solana:signMessage")
          )
            continue;
          for (const acc of (w.accounts ?? []) as any[]) {
            if (acc.address === addr) {
              match = { wallet: w, account: acc };
              break;
            }
          }
          if (match) break;
        }
        if (!match) throw new Error("Wallet Standard account not found");

        const signer = createSignerFromWalletAccount(match.wallet, match.account);
        const rpcUrl =
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
          "https://api.devnet.solana.com";
        const wsUrl =
          process.env.NEXT_PUBLIC_SOLANA_RPC_SUBSCRIPTIONS_URL ??
          rpcUrl.replace(/^http/, "ws");

        const client = await getUmbraClient({
          signer,
          network: NETWORK,
          rpcUrl,
          rpcSubscriptionsUrl: wsUrl,
          indexerApiEndpoint: INDEXER,
          deferMasterSeedSignature: true,
        });

        if (cancelled) return;
        setState({ status: "ready", client });
      } catch (e: any) {
        if (cancelled) return;
        setState({ status: "error", error: e?.message ?? String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  return state;
}
