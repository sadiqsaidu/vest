"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useUmbraClient } from "@/lib/umbra/provider";
import {
  getCachedRegistration,
  isRegistered,
  registerForMixer,
  setCachedRegistration,
} from "@/lib/umbra/registration";

type State =
  | { kind: "checking" }
  | { kind: "registered" }
  | { kind: "needs_register"; error?: string }
  | { kind: "registering" }
  | { kind: "client_error"; error: string };

export function RegisterBanner() {
  const { publicKey } = useWallet();
  const umbra = useUmbraClient();
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    const cached = getCachedRegistration(addr);
    if (cached === true) {
      setState({ kind: "registered" });
      return;
    }
    if (umbra.status === "error") {
      setState({ kind: "client_error", error: umbra.error });
      return;
    }
    if (umbra.status !== "ready") {
      setState({ kind: "checking" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ok = await isRegistered(umbra.client, addr);
        if (cancelled) return;
        setState(ok ? { kind: "registered" } : { kind: "needs_register" });
      } catch (e: any) {
        if (cancelled) return;
        setState({
          kind: "needs_register",
          error: e?.message ?? "Could not check registration",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, umbra]);

  async function onRegister() {
    if (umbra.status !== "ready" || !publicKey) return;
    setState({ kind: "registering" });
    try {
      await registerForMixer(umbra.client);
      setCachedRegistration(publicKey.toBase58(), true);
      setState({ kind: "registered" });
    } catch (e: any) {
      setState({
        kind: "needs_register",
        error: e?.message ?? "Registration failed",
      });
    }
  }

  if (state.kind === "registered" || state.kind === "checking") return null;

  if (state.kind === "client_error") {
    return (
      <div className="rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm text-text-muted">
        Could not initialize Umbra client: {state.error}
      </div>
    );
  }

  const busy = state.kind === "registering";
  const errMsg = state.kind === "needs_register" ? state.error : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-text-muted">
        Your wallet isn&rsquo;t registered with Umbra yet. Register once to use Vest.
        {errMsg && <span className="ml-2 text-danger">{errMsg}</span>}
      </div>
      <Button size="sm" onClick={onRegister} disabled={busy}>
        {busy ? "Registering… this signs a transaction" : errMsg ? "Retry" : "Register"}
      </Button>
    </div>
  );
}
