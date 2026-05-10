"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, RefreshCcw, X } from "lucide-react";
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
  | { kind: "needs_register"; error?: FriendlyError }
  | { kind: "registering" }
  | { kind: "rechecking" }
  | { kind: "client_error"; error: string };

type FriendlyError = {
  title: string;
  detail: string;
  actions?: ("faucet" | "recheck")[];
  raw?: string;
};

function classifyError(err: unknown): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);
  // Solana RPC -32002 — preflight simulation failure (no logs, 0 units).
  // Fresh devnet wallets without enough SOL hit this first.
  if (raw.includes("-32002")) {
    return {
      title: "Transaction couldn't be simulated.",
      detail:
        "This usually means the wallet doesn't have enough devnet SOL to pay rent for the registration accounts (~0.01 SOL covers all three steps), or a previous attempt is still confirming.",
      actions: ["faucet", "recheck"],
      raw,
    };
  }
  if (/insufficient.*lamports|insufficient.*funds/i.test(raw)) {
    return {
      title: "Not enough SOL for registration.",
      detail:
        "Registration needs ~0.01 devnet SOL across three transactions. Top up from the devnet faucet and retry.",
      actions: ["faucet", "recheck"],
      raw,
    };
  }
  if (/already.*processed|duplicate signature/i.test(raw)) {
    return {
      title: "Registration may have already gone through.",
      detail:
        "A previous attempt likely landed. Click “Check status” to confirm with Umbra before retrying.",
      actions: ["recheck"],
      raw,
    };
  }
  if (/blockhash|expired/i.test(raw)) {
    return {
      title: "Network blockhash expired.",
      detail:
        "The transaction sat too long before being submitted. Click “Retry”.",
      actions: ["recheck"],
      raw,
    };
  }
  if (/master.seed.derivation|signMessage|user reject/i.test(raw)) {
    return {
      title: "Wallet signature was declined.",
      detail:
        "Approve the signMessage prompt in your wallet to derive the Umbra master seed, then try again.",
      raw,
    };
  }
  if (/zk.proof|prover|proof.generation/i.test(raw)) {
    return {
      title: "Couldn’t generate the registration proof.",
      detail:
        "The browser ZK prover failed. Make sure your tab isn’t out of memory and retry. If this persists, switch to a Chromium-based browser.",
      raw,
    };
  }
  return {
    title: "Registration failed.",
    detail: raw || "Unknown error",
    actions: ["recheck"],
    raw,
  };
}

export function RegisterBanner() {
  const { publicKey } = useWallet();
  const umbra = useUmbraClient();
  const [state, setState] = useState<State>({ kind: "checking" });
  const [showRaw, setShowRaw] = useState(false);

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
          error: classifyError(e),
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
        error: classifyError(e),
      });
    }
  }

  async function onRecheck() {
    if (umbra.status !== "ready" || !publicKey) return;
    setState({ kind: "rechecking" });
    try {
      // Bypass cache — query fresh against the chain.
      setCachedRegistration(publicKey.toBase58(), false);
      const ok = await isRegistered(umbra.client, publicKey.toBase58());
      if (ok) {
        setCachedRegistration(publicKey.toBase58(), true);
        setState({ kind: "registered" });
      } else {
        setState({ kind: "needs_register" });
      }
    } catch (e: any) {
      setState({
        kind: "needs_register",
        error: classifyError(e),
      });
    }
  }

  if (state.kind === "registered" || state.kind === "checking") return null;

  if (state.kind === "client_error") {
    return (
      <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-text-muted">
        Could not initialize Umbra client: {state.error}
      </div>
    );
  }

  const busy = state.kind === "registering" || state.kind === "rechecking";
  const err = state.kind === "needs_register" ? state.error : undefined;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-1">
          {err ? (
            <>
              <div className="flex items-center gap-2 text-sm text-text">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--warning)" }}
                />
                {err.title}
              </div>
              <p className="max-w-prose text-xs text-text-muted">{err.detail}</p>
              {err.raw && (
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="text-[11px] text-text-subtle underline-offset-2 hover:underline"
                >
                  {showRaw ? "Hide" : "Show"} raw error
                </button>
              )}
              {showRaw && err.raw && (
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-sunken p-2 font-mono text-[10px] leading-tight text-text-subtle">
                  {err.raw}
                </pre>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-text">
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                Register your wallet with Umbra.
              </div>
              <p className="max-w-prose text-xs text-text-muted">
                One-time setup. Three short transactions create your account,
                register an X25519 key, and stake the user commitment used by
                the mixer.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {(err?.actions?.includes("faucet") || !err) && (
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs text-text hover:border-border-strong"
            >
              <ExternalLink size={11} />
              Devnet faucet
            </a>
          )}
          {err?.actions?.includes("recheck") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecheck}
              disabled={busy}
            >
              <RefreshCcw size={11} />
              {state.kind === "rechecking" ? "Checking…" : "Check status"}
            </Button>
          )}
          <Button size="sm" onClick={onRegister} disabled={busy}>
            {state.kind === "registering"
              ? "Registering…"
              : err
                ? "Retry"
                : "Register"}
          </Button>
        </div>
      </div>
    </div>
  );
}
