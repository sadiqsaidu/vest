"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useUmbraClient } from "@/lib/umbra/provider";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenByMint, tokenSymbolFromMint } from "@/lib/tokens";
import { formatAmount, truncateAddress } from "@/lib/utils";
import {
  ScheduleTimeline,
  type TimelineUnlock,
} from "@/components/primitives/ScheduleTimeline";

const SOLSCAN = "https://solscan.io/tx/";
const CLUSTER = "?cluster=devnet";

type ClaimRow = {
  id: string;
  cap_table_id: string;
  project_name: string;
  mint: string | null;
  founder_wallet: string | null;
  beneficiary_label: string;
  unlock_timestamp: number;
  amount: string;
  status: "scheduled" | "utxo_created" | "claimed";
  utxo_creation_tx: string | null;
  claim_tx_signature: string | null;
  claimed_at: string | null;
};

type ScannedUtxo = {
  amount: bigint;
  destinationAddress: string;
  commitmentIndex: bigint;
  raw: any; // keep the original SDK object for the claim() call
};

type ProjectGroup = {
  project_name: string;
  mint: string;
  rows: ClaimRow[];
};

type ModalStep = "confirm" | "working" | "done";

type ClaimResult = {
  rowId: string;
  ok: boolean;
  signature?: string;
  reason?: string;
};

export function ClaimFlow() {
  const wallet = useWallet();
  const umbra = useUmbraClient();
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScannedUtxo[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [needsRegistration, setNeedsRegistration] = useState<boolean | null>(
    null,
  );
  const [registering, setRegistering] = useState(false);

  // Modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("confirm");
  const [modalProgress, setModalProgress] = useState<{
    i: number;
    n: number;
  }>({ i: 0, n: 0 });
  const [modalResults, setModalResults] = useState<ClaimResult[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);

  const walletAddr = wallet.publicKey?.toBase58() ?? null;

  // Fetch claims from our DB.
  useEffect(() => {
    if (!wallet.connected || !walletAddr) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "list_claims");
        const res = await fetch(`/api/claims?wallet=${walletAddr}`, {
          headers: authHeaders(auth),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setClaims(json.claims);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, walletAddr]);

  // Check registration & scan once Umbra client is ready.
  useEffect(() => {
    if (umbra.status !== "ready") return;
    if (!walletAddr) return;
    let cancelled = false;
    (async () => {
      try {
        const client = (umbra as any).client;
        const { getUserAccountQuerierFunction } = await import(
          "@umbra-privacy/sdk"
        );
        const query = getUserAccountQuerierFunction({ client });
        const result: any = await query(walletAddr as any);
        if (cancelled) return;
        const exists = result?.state === "exists";
        const fullyActive = exists && !!result.data?.isActiveForAnonymousUsage;
        setNeedsRegistration(!fullyActive);
        if (fullyActive) {
          await runScan(client);
        }
      } catch (e: any) {
        if (!cancelled) setScanError(e?.message ?? "Failed to check account");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [umbra.status, walletAddr]);

  async function runScan(client: any) {
    setScanning(true);
    setScanError(null);
    try {
      const { getClaimableUtxoScannerFunction } = await import(
        "@umbra-privacy/sdk"
      );
      const scan = getClaimableUtxoScannerFunction({ client });
      // tree 0 from leaf 0; SDK returns nextScanStartIndex if we wanted to paginate.
      const result: any = await scan(0 as any, 0 as any);
      const received: any[] = result?.received ?? [];
      const mapped: ScannedUtxo[] = received
        .map((u) => ({
          amount: BigInt(u.amount ?? 0n),
          destinationAddress: String(u.destinationAddress ?? ""),
          commitmentIndex: BigInt(u.commitmentIndex ?? 0n),
          raw: u,
        }))
        .sort((a, b) =>
          a.commitmentIndex < b.commitmentIndex
            ? -1
            : a.commitmentIndex > b.commitmentIndex
              ? 1
              : 0,
        );
      setScanned(mapped);
    } catch (e: any) {
      setScanError(e?.message ?? "Scan failed");
      setScanned([]);
    } finally {
      setScanning(false);
    }
  }

  async function refreshScan() {
    if (umbra.status !== "ready") return;
    await runScan((umbra as any).client);
  }

  async function register() {
    if (umbra.status !== "ready") return;
    setRegistering(true);
    setScanError(null);
    try {
      const client = (umbra as any).client;
      const { getUserRegistrationFunction } = await import("@umbra-privacy/sdk");
      const reg = getUserRegistrationFunction({ client });
      await reg({ confidential: true, anonymous: true });
      setNeedsRegistration(false);
      await runScan(client);
    } catch (e: any) {
      setScanError(e?.message ?? "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  // Group claims by project for greeting + display.
  const grouped: ProjectGroup[] = useMemo(() => {
    if (!claims) return [];
    const map = new Map<string, ProjectGroup>();
    for (const c of claims) {
      const key = c.cap_table_id ?? `direct:${c.id}`;
      const existing = map.get(key);
      if (existing) existing.rows.push(c);
      else
        map.set(key, {
          project_name: c.project_name,
          mint: c.mint ?? "",
          rows: [c],
        });
    }
    return [...map.values()].sort((a, b) =>
      a.project_name.localeCompare(b.project_name),
    );
  }, [claims]);

  // Pair scanner UTXOs with our schedule rows by sorted order.
  // Match per (mint) — beneficiary may receive across mints.
  const pairings = useMemo(() => {
    if (!claims || !scanned) return null;
    const pendingByMint = new Map<string, ClaimRow[]>();
    for (const c of claims) {
      if (c.status !== "utxo_created") continue;
      if (!c.mint) continue;
      const list = pendingByMint.get(c.mint) ?? [];
      list.push(c);
      pendingByMint.set(c.mint, list);
    }
    for (const [mint, rows] of pendingByMint) {
      rows.sort((a, b) => a.unlock_timestamp - b.unlock_timestamp);
      pendingByMint.set(mint, rows);
    }

    const matched: { row: ClaimRow; utxo: ScannedUtxo }[] = [];
    const unmatchedRows: ClaimRow[] = [];
    const unmatchedUtxos: ScannedUtxo[] = [];

    // Group scanned by an inferred mint via amount-equality scan; we don't have
    // mint on the scan output in a clean form, so we match by amount within mint.
    const remainingScanned = [...scanned];
    for (const [, rows] of pendingByMint) {
      for (const row of rows) {
        const amt = BigInt(row.amount);
        const idx = remainingScanned.findIndex((u) => u.amount === amt);
        if (idx >= 0) {
          matched.push({ row, utxo: remainingScanned[idx] });
          remainingScanned.splice(idx, 1);
        } else {
          unmatchedRows.push(row);
        }
      }
    }
    unmatchedUtxos.push(...remainingScanned);
    return { matched, unmatchedRows, unmatchedUtxos };
  }, [claims, scanned]);

  if (!wallet.connected) return null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-prose px-6 py-10 text-sm text-danger">
        {loadError}
      </div>
    );
  }

  if (!claims || (umbra.status === "loading" || umbra.status === "idle")) {
    return (
      <div className="mx-auto max-w-prose px-6 py-10 text-sm text-text-subtle">
        Loading…
      </div>
    );
  }

  if (umbra.status === "error") {
    return (
      <div className="mx-auto max-w-prose px-6 py-10 text-sm text-danger">
        Umbra: {umbra.error}
      </div>
    );
  }

  if (claims.length === 0 && (scanned ?? []).length === 0) {
    return (
      <EmptyState />
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const claimable = claims.filter(
    (c) => c.status === "utxo_created" && c.unlock_timestamp <= now,
  );
  const totalsByMint = new Map<string, bigint>();
  for (const c of claimable) {
    if (!c.mint) continue;
    totalsByMint.set(
      c.mint,
      (totalsByMint.get(c.mint) ?? 0n) + BigInt(c.amount),
    );
  }
  const claimableNow = totalsByMint.size > 0 ? [...totalsByMint.entries()] : [];
  const totalsAcrossMints = new Map<string, bigint>();
  for (const c of claims) {
    if (!c.mint) continue;
    totalsAcrossMints.set(
      c.mint,
      (totalsAcrossMints.get(c.mint) ?? 0n) + BigInt(c.amount),
    );
  }
  const projectNames = grouped.map((g) => g.project_name);
  const totalUnlocks = claims.length;

  const claimedHistory = claims.filter((c) => c.status === "claimed");

  // Map claims to timeline unlocks. Use the row's mint to resolve token info.
  const timelineUnlocks: TimelineUnlock[] = claims
    .filter((c) => c.mint)
    .map((c) => {
      const tok = tokenByMint(c.mint!);
      return {
        id: c.id,
        unlock_timestamp: c.unlock_timestamp,
        amount: BigInt(c.amount),
        decimals: tok?.decimals ?? 6,
        symbol: tok?.symbol ?? tokenSymbolFromMint(c.mint!),
        status: c.status,
        label: c.beneficiary_label,
      };
    });

  // Decide CTA state.
  const noClaimableYet = claimableNow.length === 0;
  const indexerLag =
    pairings &&
    pairings.matched.length === 0 &&
    claims.some((c) => c.status === "utxo_created");

  return (
    <div className="mx-auto max-w-[720px] px-6 py-12 space-y-12">
      {/* SECTION 1 — Greeting */}
      <section className="space-y-2">
        <h1 className="text-[48px] leading-[1.05] tracking-h1">Hello.</h1>
        <p className="text-[20px] text-text-muted">
          {projectNames.length === 0
            ? "Direct payments are waiting for you."
            : projectNames.length === 1
              ? `${projectNames[0]} has set up vesting for you.`
              : `You have vesting from ${projectNames.length} projects: ${projectNames.join(", ")}.`}
        </p>
      </section>

      {/* Registration prompt — auto if needed */}
      {needsRegistration && (
        <section className="rounded-md border border-border bg-surface-sunken p-6 space-y-3">
          <h2 className="text-lg tracking-h2">Register to receive</h2>
          <p className="text-sm text-text-muted">
            One-time setup: register your encryption keys with Umbra so you can
            decrypt and claim your unlocks privately. Two wallet signatures.
          </p>
          <Button onClick={register} disabled={registering}>
            {registering ? "Registering…" : "Register"}
          </Button>
          {scanError && (
            <p className="text-sm text-danger">{scanError}</p>
          )}
        </section>
      )}

      {/* SECTION 2 — Claimable highlight */}
      {!needsRegistration && (
        <section className="space-y-3">
          {claimableNow.length === 0 ? (
            <>
              <div className="font-mono text-[64px] leading-[1] tracking-tight text-text">
                0
              </div>
              <div className="text-text-muted">claimable now</div>
              {totalsAcrossMints.size > 0 && (
                <div className="text-sm text-text-muted">
                  {[...totalsAcrossMints.entries()].map(([mint, total]) => {
                    const tok = tokenByMint(mint);
                    const sym = tok?.symbol ?? tokenSymbolFromMint(mint);
                    const dec = tok?.decimals ?? 6;
                    return (
                      <div key={mint}>
                        {formatAmount(total, dec)} {sym} total across{" "}
                        {totalUnlocks} unlocks
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {claimableNow.map(([mint, total]) => {
                const tok = tokenByMint(mint);
                const sym = tok?.symbol ?? tokenSymbolFromMint(mint);
                const dec = tok?.decimals ?? 6;
                return (
                  <div key={mint}>
                    <div className="font-mono text-[64px] leading-[1] tracking-tight text-text">
                      {formatAmount(total, dec)}{" "}
                      <span className="text-text-muted">{sym}</span>
                    </div>
                  </div>
                );
              })}
              <div className="text-text-muted">claimable now</div>
              <div className="text-sm text-text-muted">
                {[...totalsAcrossMints.entries()].map(([mint, total]) => {
                  const tok = tokenByMint(mint);
                  const sym = tok?.symbol ?? tokenSymbolFromMint(mint);
                  const dec = tok?.decimals ?? 6;
                  return (
                    <div key={mint}>
                      {formatAmount(total, dec)} {sym} total across{" "}
                      {totalUnlocks} unlocks
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="pt-2">
            <Button
              size="lg"
              disabled={
                noClaimableYet ||
                !pairings ||
                pairings.matched.filter(
                  (m) => m.row.unlock_timestamp <= now,
                ).length === 0
              }
              onClick={() => {
                setModalOpen(true);
                setModalStep("confirm");
                setModalResults([]);
                setModalError(null);
              }}
            >
              Claim privately
            </Button>
          </div>

          {indexerLag && (
            <div className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-text-muted">
              Your unlock UTXOs are still being indexed. This usually takes
              under a minute.{" "}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={refreshScan}
                disabled={scanning}
              >
                {scanning ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          )}

          {scanError && !needsRegistration && (
            <div className="text-sm text-danger">{scanError}</div>
          )}
        </section>
      )}

      {/* SECTION 3 — Timeline */}
      {timelineUnlocks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm tracking-h2 text-text-muted">Schedule</h2>
          <div className="rounded-md border border-border bg-surface p-6">
            <ScheduleTimeline unlocks={timelineUnlocks} size="md" />
          </div>
        </section>
      )}

      {/* SECTION 4 — History */}
      {claimedHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm tracking-h2 text-text-muted">Recent claims</h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {claimedHistory.map((c) => {
              const tok = tokenByMint(c.mint ?? "");
              const sym = tok?.symbol ?? tokenSymbolFromMint(c.mint ?? "");
              const dec = tok?.decimals ?? 6;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="font-mono text-text-muted">
                    {c.claimed_at
                      ? new Date(c.claimed_at).toLocaleDateString()
                      : "—"}
                  </span>
                  <span className="font-mono text-text">
                    {formatAmount(BigInt(c.amount), dec)} {sym}
                  </span>
                  {c.claim_tx_signature ? (
                    <a
                      href={`${SOLSCAN}${c.claim_tx_signature}${CLUSTER}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-accent hover:underline"
                    >
                      {truncateAddress(c.claim_tx_signature, 6)} ↗
                    </a>
                  ) : (
                    <span className="text-text-subtle">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Pair-up summary for transparency / unmatched rows */}
      {pairings &&
        (pairings.unmatchedRows.length > 0 ||
          pairings.unmatchedUtxos.length > 0) && (
          <section className="space-y-2">
            {pairings.unmatchedRows.length > 0 && (
              <p className="text-xs text-text-subtle">
                {pairings.unmatchedRows.length} scheduled unlock(s) are not yet
                visible in the mixer index. Refresh shortly.
              </p>
            )}
            {pairings.unmatchedUtxos.length > 0 && (
              <p className="text-xs text-text-subtle">
                {pairings.unmatchedUtxos.length} additional payment(s) found that
                Vest doesn&rsquo;t have a schedule for — direct payments.
              </p>
            )}
          </section>
        )}

      {modalOpen && pairings && (
        <ClaimModal
          step={modalStep}
          progress={modalProgress}
          results={modalResults}
          error={modalError}
          walletAddr={walletAddr ?? ""}
          onCancel={() => setModalOpen(false)}
          onConfirm={async () => {
            await runClaim();
          }}
          claimable={pairings.matched.filter(
            (m) => m.row.unlock_timestamp <= now,
          )}
        />
      )}
    </div>
  );

  async function runClaim() {
    if (umbra.status !== "ready" || !pairings) return;
    const client = (umbra as any).client;
    const now = Math.floor(Date.now() / 1000);
    const targets = pairings.matched.filter((m) => m.row.unlock_timestamp <= now);
    if (targets.length === 0) {
      setModalError("Nothing to claim right now.");
      return;
    }

    setModalStep("working");
    setModalProgress({ i: 0, n: targets.length });
    setModalResults([]);
    setModalError(null);

    try {
      const indexerUrl =
        process.env.NEXT_PUBLIC_UMBRA_RELAYER_URL ??
        "https://relayer.api-devnet.umbraprivacy.com";

      const [
        {
          getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
          getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
          getUmbraRelayer,
        },
        zk,
      ] = await Promise.all([
        import("@umbra-privacy/sdk"),
        import("@umbra-privacy/web-zk-prover"),
      ]);

      const proverFn =
        (zk as any).getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver;
      if (typeof proverFn !== "function") {
        throw new Error(
          "ZK prover module missing getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver",
        );
      }
      const zkProver = proverFn();
      const relayer = getUmbraRelayer({ apiEndpoint: indexerUrl });

      const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
        { client },
        {
          zkProver,
          relayer,
          fetchBatchMerkleProof: client.fetchBatchMerkleProof,
        },
      );
      const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction(
        { client },
      );

      // Step A: claim ALL targeted UTXOs into encrypted balance in one call
      // (SDK auto-batches up to 4 per batch).
      let claimSig = "";
      try {
        const result: any = await claim(targets.map((t) => t.utxo.raw));
        // Pull a representative tx signature out of the batch results.
        const firstBatch = result?.batches
          ? [...result.batches.values()][0]
          : null;
        claimSig = firstBatch?.txSignature ?? firstBatch?.callbackSignature ?? "";
      } catch (err: any) {
        const stage = err?.stage as string | undefined;
        const msg = mapClaimError(stage, err);
        setModalError(msg);
        setModalStep("confirm");
        return;
      }

      // Step B: per row, withdraw the claimed amount to the connected wallet.
      const results: ClaimResult[] = [];
      for (let i = 0; i < targets.length; i++) {
        const { row } = targets[i];
        setModalProgress({ i: i + 1, n: targets.length });
        try {
          if (!row.mint) throw new Error("Missing mint on row");
          const wresult: any = await withdraw(
            client.signer.address,
            row.mint as any,
            BigInt(row.amount) as any,
          );
          const sig: string =
            wresult?.queueSignature ?? wresult?.callbackSignature ?? claimSig;

          // Persist to DB.
          const auth = await signAuth(wallet, "mark_claimed");
          const res = await fetch(
            `/api/schedule/${row.id}/mark-claimed`,
            {
              method: "POST",
              headers: {
                ...authHeaders(auth),
                "content-type": "application/json",
              },
              body: JSON.stringify({ claim_tx_signature: sig }),
            },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(
              body?.error ?? `Persist mark-claimed failed (${res.status})`,
            );
          }

          results.push({ rowId: row.id, ok: true, signature: sig });
        } catch (err: any) {
          results.push({
            rowId: row.id,
            ok: false,
            reason: err?.message ?? "Withdraw failed",
          });
        }
        setModalResults([...results]);
      }

      setModalStep("done");
      // Refresh from server so history + dots update.
      const auth = await signAuth(wallet, "list_claims");
      const res = await fetch(`/api/claims?wallet=${walletAddr}`, {
        headers: authHeaders(auth),
      });
      if (res.ok) {
        const json = await res.json();
        setClaims(json.claims);
      }
    } catch (err: any) {
      setModalError(err?.message ?? String(err));
      setModalStep("confirm");
    }
  }
}

function EmptyState() {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-prose flex-col items-center justify-center px-6 text-center">
      <div className="rounded-md border border-border bg-surface p-8 space-y-2">
        <h2 className="text-lg tracking-h2">No vesting unlocks for this wallet.</h2>
        <p className="text-sm text-text-muted">
          If you&rsquo;re expecting one, ask the founder to confirm
          they&rsquo;ve added you to the schedule.
        </p>
      </div>
    </div>
  );
}

function ClaimModal({
  step,
  progress,
  results,
  error,
  walletAddr,
  onCancel,
  onConfirm,
  claimable,
}: {
  step: ModalStep;
  progress: { i: number; n: number };
  results: ClaimResult[];
  error: string | null;
  walletAddr: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  claimable: { row: ClaimRow; utxo: ScannedUtxo }[];
}) {
  const totals = new Map<string, bigint>();
  for (const c of claimable) {
    if (!c.row.mint) continue;
    totals.set(
      c.row.mint,
      (totals.get(c.row.mint) ?? 0n) + BigInt(c.row.amount),
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-md">
        {step === "confirm" && (
          <>
            <h3 className="text-xl tracking-h2">
              {claimable.length} claimable unlock
              {claimable.length === 1 ? "" : "s"}.
            </h3>
            <div className="mt-4 space-y-1">
              {[...totals.entries()].map(([mint, amt]) => {
                const tok = tokenByMint(mint);
                const sym = tok?.symbol ?? tokenSymbolFromMint(mint);
                const dec = tok?.decimals ?? 6;
                return (
                  <div
                    key={mint}
                    className="font-mono text-3xl tabular-nums text-text"
                  >
                    {formatAmount(amt, dec)}{" "}
                    <span className="text-text-muted">{sym}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-text-muted">
              Funds will arrive at your connected wallet (
              <span className="font-mono">{truncateAddress(walletAddr, 6)}</span>
              ). Because this is a public withdrawal, the destination and amount
              are visible on-chain — but the link to the original deposit is
              hidden.
            </p>
            {error && (
              <div className="mt-3 text-sm text-danger">{error}</div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={() => void onConfirm()}>Claim privately</Button>
            </div>
          </>
        )}

        {step === "working" && (
          <>
            <h3 className="text-xl tracking-h2">Claiming…</h3>
            <p className="mt-2 text-sm text-text-muted">
              Generating your private withdrawal proof. This takes a few
              seconds.
            </p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full w-1/3 animate-pulse bg-border-strong" />
            </div>
            <p className="mt-4 text-sm text-text-muted">
              {progress.i} of {progress.n} claimed.
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <h3 className="text-xl tracking-h2">Done.</h3>
            <p className="mt-2 text-sm text-text">
              Withdrawn{" "}
              {[...totals.entries()].map(([mint, amt], i) => {
                const tok = tokenByMint(mint);
                const sym = tok?.symbol ?? tokenSymbolFromMint(mint);
                const dec = tok?.decimals ?? 6;
                return (
                  <span key={mint}>
                    {i > 0 ? " + " : ""}
                    <span className="font-mono">
                      {formatAmount(amt, dec)} {sym}
                    </span>
                  </span>
                );
              })}
              . Funds will arrive in your wallet shortly.
            </p>
            <ul className="mt-4 space-y-1 text-xs">
              {results.map((r, i) => (
                <li key={r.rowId}>
                  {r.ok ? (
                    <a
                      href={`${SOLSCAN}${r.signature}${CLUSTER}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-accent hover:underline"
                    >
                      tx {i + 1}: {truncateAddress(r.signature ?? "", 6)} ↗
                    </a>
                  ) : (
                    <span className="text-danger">
                      tx {i + 1} failed: {r.reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-text-muted">
              These transactions are unlinkable from the original deposit on
              the public ledger.
            </p>
            <div className="mt-6 flex justify-end">
              <Button onClick={onCancel}>Done</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function mapClaimError(stage: string | undefined, err: any): string {
  switch (stage) {
    case "zk-proof-generation":
      return "Failed to generate proof. Please try again.";
    case "transaction-sign":
      return "Claim cancelled.";
    case "transaction-validate":
      return "Merkle proof was stale. Refresh and try again.";
    case "transaction-send":
      return "Confirmation timed out. Check your wallet — the claim may have already landed.";
    default:
      return err?.message ?? "Claim failed.";
  }
}
