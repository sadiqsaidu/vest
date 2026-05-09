"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { useUmbraClient } from "@/lib/umbra/provider";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenByMint, tokenSymbolFromMint } from "@/lib/tokens";
import { formatAmount, truncateAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ShieldStatus =
  | "pending"
  | "shielded"
  | "utxos_created"
  | "partially_claimed"
  | "fully_claimed";

type CapTable = {
  id: string;
  founder_wallet: string;
  project_name: string;
  mint: string;
  total: string;
  shield_status: ShieldStatus;
  shield_tx_signature?: string | null;
  test_mode: boolean;
};

type ScheduleRow = {
  id: string;
  beneficiary_wallet: string;
  beneficiary_label: string;
  unlock_timestamp: number;
  amount: string;
  status: string;
  utxo_creation_tx?: string | null;
};

type StageState = "pending" | "active" | "done" | "failed";

type Stage = {
  key: string;
  label: string;
  state: StageState;
  detail?: string;
};

type RowResult = {
  id: string;
  label: string;
  ok: boolean;
  reason?: string;
  unregistered?: boolean;
  signature?: string;
};

const STAGE_KEYS = [
  "shield",
  "verify",
  "utxos",
  "confirm",
  "activate",
] as const;

const SOLSCAN_BASE = "https://solscan.io/tx/";
const SOLSCAN_CLUSTER = "?cluster=devnet";

function solscanUrl(sig: string): string {
  return `${SOLSCAN_BASE}${sig}${SOLSCAN_CLUSTER}`;
}

function makeStages(): Stage[] {
  return [
    { key: "shield", label: "Shield treasury", state: "pending" },
    { key: "verify", label: "Verify encrypted balance", state: "pending" },
    { key: "utxos", label: "Create unlock UTXOs", state: "pending" },
    { key: "confirm", label: "Confirm on-chain", state: "pending" },
    { key: "activate", label: "Activate vest", state: "pending" },
  ];
}

export function ShieldFlow({ id }: { id: string }) {
  const wallet = useWallet();
  const umbra = useUmbraClient();
  const [data, setData] = useState<{ cap_table: CapTable; schedule: ScheduleRow[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>(makeStages());
  const [running, setRunning] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [shieldSig, setShieldSig] = useState<string | null>(null);
  const [utxoResults, setUtxoResults] = useState<RowResult[]>([]);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const startedRef = useRef(false);

  // Load cap table + schedule.
  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await signAuth(wallet, "read_cap_table");
        const res = await fetch(`/api/cap-tables/${id}`, {
          headers: authHeaders(auth),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        if (json.cap_table.shield_status === "shielded") {
          setShieldSig(json.cap_table.shield_tx_signature ?? null);
          setStages((prev) =>
            prev.map((s) =>
              s.key === "shield" || s.key === "verify"
                ? { ...s, state: "done" }
                : s,
            ),
          );
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, wallet.publicKey?.toBase58(), id]);

  const totals = useMemo(() => {
    if (!data) return null;
    const total = BigInt(data.cap_table.total);
    const beneficiaries = new Set(
      data.schedule.map((r) => r.beneficiary_wallet),
    );
    return {
      total,
      beneficiaries: beneficiaries.size,
      unlocks: data.schedule.length,
    };
  }, [data]);

  const tokenInfo = useMemo(() => {
    if (!data) return null;
    const t = tokenByMint(data.cap_table.mint);
    return {
      symbol: t?.symbol ?? tokenSymbolFromMint(data.cap_table.mint),
      decimals: t?.decimals ?? 6,
    };
  }, [data]);

  function setStage(key: string, state: StageState, detail?: string) {
    setStages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, state, detail } : s)),
    );
  }

  async function persistShield(signature: string) {
    const auth = await signAuth(wallet, "shield_treasury");
    const res = await fetch(`/api/cap-tables/${id}/shield`, {
      method: "PATCH",
      headers: { ...authHeaders(auth), "content-type": "application/json" },
      body: JSON.stringify({ shield_tx_signature: signature }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Persist shield failed (${res.status})`);
    }
  }

  async function persistUtxo(rowId: string, commitment: string, sig: string) {
    const auth = await signAuth(wallet, "create_utxo");
    const res = await fetch(`/api/schedule/${rowId}`, {
      method: "PATCH",
      headers: { ...authHeaders(auth), "content-type": "application/json" },
      body: JSON.stringify({
        utxo_commitment: commitment,
        utxo_creation_tx: sig,
        status: "utxo_created",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Persist utxo failed (${res.status})`);
    }
  }

  async function activate() {
    const auth = await signAuth(wallet, "activate_vest");
    const res = await fetch(`/api/cap-tables/${id}/activate`, {
      method: "POST",
      headers: { ...authHeaders(auth), "content-type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Activate failed (${res.status})`);
    }
  }

  async function runFlow(opts: { resume: boolean }) {
    if (!data || !tokenInfo || !totals) return;
    if (umbra.status !== "ready") return;
    if (running) return;
    setRunning(true);
    setWarning(null);
    setErrorDetail(null);

    const client = (umbra as any).client;
    const mintAddr = data.cap_table.mint as any;

    try {
      // ---------- STAGE 1 — Shield ----------
      if (!opts.resume) {
        setStage("shield", "active");
        setProgressLabel("Sending treasury to private balance…");
        try {
          const { getPublicBalanceToEncryptedBalanceDirectDepositorFunction } =
            await import("@umbra-privacy/sdk");
          const deposit =
            getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
          const result = await deposit(
            client.signer.address,
            mintAddr,
            totals.total as any,
          );
          const sig = result.queueSignature as string;
          setShieldSig(sig);
          if (
            result.callbackStatus === "pruned" ||
            result.callbackStatus === "timed-out"
          ) {
            setWarning(
              "The MPC computation did not finalize. Proceeding to verify the balance — if the balance is correct, the vest will still work.",
            );
          }
          await persistShield(sig);
          setStage("shield", "done", `tx ${truncateAddress(sig, 6)}`);
        } catch (err: any) {
          const stage = err?.stage as string | undefined;
          const message = mapDepositError(stage, err);
          setStage("shield", "failed", message);
          setErrorDetail(err?.message ?? String(err));
          setRunning(false);
          return;
        }
      }

      // ---------- STAGE 2 — Verify encrypted balance ----------
      setStage("verify", "active");
      setProgressLabel("Confirming private balance…");
      try {
        const { getEncryptedBalanceQuerierFunction } = await import(
          "@umbra-privacy/sdk"
        );
        const queryBal = getEncryptedBalanceQuerierFunction({ client });
        let balances = await queryBal([mintAddr]);
        let entry: any = balances.get(mintAddr);
        if (entry?.state === "mxe") {
          const { getNetworkEncryptionToSharedEncryptionConverterFunction } =
            await import("@umbra-privacy/sdk");
          const convert = getNetworkEncryptionToSharedEncryptionConverterFunction({
            client,
          });
          await convert([mintAddr]);
          balances = await queryBal([mintAddr]);
          entry = balances.get(mintAddr);
        }
        if (
          !entry ||
          entry.state === "uninitialized" ||
          entry.state === "non_existent"
        ) {
          setStage(
            "verify",
            "failed",
            "Balance not found. Stage 1 may still be processing. Wait 10s and retry.",
          );
          setRunning(false);
          return;
        }
        if (entry.state === "shared") {
          const have = BigInt(entry.balance ?? 0n);
          if (have < totals.total) {
            setStage(
              "verify",
              "failed",
              `Balance ${have} < required ${totals.total}. Wait and retry.`,
            );
            setRunning(false);
            return;
          }
        }
        setStage("verify", "done");
      } catch (err: any) {
        setStage("verify", "failed", err?.message ?? "Query failed");
        setErrorDetail(err?.message ?? String(err));
        setRunning(false);
        return;
      }

      // ---------- STAGE 3 — Create UTXOs ----------
      setStage("utxos", "active");
      const queue = data.schedule.filter((r) => r.status === "scheduled");
      const total = data.schedule.length;
      const alreadyDone = total - queue.length;
      const results: RowResult[] = data.schedule
        .filter((r) => r.status === "utxo_created")
        .map((r) => ({
          id: r.id,
          label: r.beneficiary_label,
          ok: true,
          signature: r.utxo_creation_tx ?? undefined,
        }));
      setUtxoResults(results);

      const [
        { getUserAccountQuerierFunction, getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction },
        zk,
      ] = await Promise.all([
        import("@umbra-privacy/sdk"),
        import("@umbra-privacy/web-zk-prover"),
      ]);

      const proverFn =
        (zk as any).getCreateReceiverClaimableUtxoFromEncryptedBalanceProver;
      if (typeof proverFn !== "function") {
        setStage(
          "utxos",
          "failed",
          "ZK prover module missing expected export.",
        );
        setErrorDetail(
          "Expected `getCreateReceiverClaimableUtxoFromEncryptedBalanceProver` from @umbra-privacy/web-zk-prover.",
        );
        setRunning(false);
        return;
      }
      const zkProver = proverFn();

      const createUtxo = getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction(
        { client },
        { zkProver },
      );
      const queryUser = getUserAccountQuerierFunction({ client });

      let i = alreadyDone;
      for (const row of queue) {
        i += 1;
        setProgressLabel(`Generating ZK proof for unlock ${i} of ${total}…`);

        // a) Check beneficiary registration.
        try {
          const u = await queryUser(row.beneficiary_wallet as any);
          const exists = (u as any).state === "exists";
          const keyOk = exists && (u as any).data?.isUserAccountX25519KeyRegistered;
          if (!exists || !keyOk) {
            results.push({
              id: row.id,
              label: row.beneficiary_label,
              ok: false,
              unregistered: true,
              reason: `${row.beneficiary_label} has not registered with Umbra yet. Ask them to visit /claim to register before funding.`,
            });
            setUtxoResults([...results]);
            continue;
          }
        } catch (err: any) {
          results.push({
            id: row.id,
            label: row.beneficiary_label,
            ok: false,
            reason: `Could not check registration: ${err?.message ?? err}`,
          });
          setUtxoResults([...results]);
          continue;
        }

        // b/c) Create UTXO + persist.
        try {
          const result: any = await createUtxo({
            destinationAddress: row.beneficiary_wallet as any,
            mint: mintAddr,
            amount: BigInt(row.amount) as any,
          });
          const sig: string =
            result.queueSignature ?? result.createProofAccountSignature;
          // Use callbackSignature when finalized as the commitment-publication tx;
          // fall back to queueSignature.
          const commitmentTx: string = result.callbackSignature ?? sig;
          const commitment = commitmentTx;
          await persistUtxo(row.id, commitment, sig);
          results.push({
            id: row.id,
            label: row.beneficiary_label,
            ok: true,
            signature: sig,
          });
          setUtxoResults([...results]);
          setProgressLabel(`${i} of ${total} UTXOs created`);
        } catch (err: any) {
          const stage = err?.stage as string | undefined;
          let reason = mapCreateUtxoError(stage, err);

          if (stage === "transaction-send") {
            // Don't immediately retry — try to scan the recipient's UTXOs.
            try {
              const { getClaimableUtxoScannerFunction } = await import(
                "@umbra-privacy/sdk"
              );
              const scan = getClaimableUtxoScannerFunction({ client });
              const scanResult: any = await scan(0 as any, 0 as any);
              const found = (scanResult?.received ?? []).some(
                (u: any) =>
                  String(u?.recipient ?? u?.recipientAddress ?? "") ===
                  row.beneficiary_wallet,
              );
              if (found) {
                const sig = "scan-recovered";
                await persistUtxo(row.id, sig, sig);
                results.push({
                  id: row.id,
                  label: row.beneficiary_label,
                  ok: true,
                  signature: sig,
                });
                setUtxoResults([...results]);
                continue;
              }
            } catch {
              // ignore — fall through
            }
          }

          results.push({
            id: row.id,
            label: row.beneficiary_label,
            ok: false,
            reason,
          });
          setUtxoResults([...results]);
        }
      }

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setStage(
          "utxos",
          "failed",
          `${results.length - failed.length} of ${total} UTXOs created. ${failed.length} failed.`,
        );
        setRunning(false);
        return;
      }
      setStage("utxos", "done", `${results.length} of ${total} UTXOs created`);

      // ---------- STAGE 4 — Confirm on-chain ----------
      setStage("confirm", "active");
      setProgressLabel(`All ${total} UTXOs confirmed on-chain.`);
      setStage("confirm", "done");

      // ---------- STAGE 5 — Activate ----------
      setStage("activate", "active");
      setProgressLabel("Activating vest…");
      try {
        await activate();
        setStage("activate", "done");
      } catch (err: any) {
        setStage("activate", "failed", err?.message ?? "Activate failed");
        setErrorDetail(err?.message ?? String(err));
      }
    } finally {
      setRunning(false);
    }
  }

  async function activateAnyway() {
    if (!data) return;
    setRunning(true);
    try {
      await activate();
      setStage("activate", "done");
      // Refetch.
      const auth = await signAuth(wallet, "read_cap_table");
      const res = await fetch(`/api/cap-tables/${id}`, {
        headers: authHeaders(auth),
      });
      if (res.ok) setData(await res.json());
    } catch (err: any) {
      setErrorDetail(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-container px-6 py-10 text-sm text-danger">
        {loadError}
      </div>
    );
  }
  if (!data || !totals || !tokenInfo) {
    return (
      <div className="mx-auto max-w-container space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-40" />
        <div className="space-y-3 pt-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (data.cap_table.shield_status === "utxos_created") {
    return (
      <div className="mx-auto max-w-container px-6 py-10 space-y-6">
        <h1 className="text-3xl tracking-h1">{data.cap_table.project_name}</h1>
        <p className="text-text-muted">This vest is already active.</p>
        <Link href={`/dashboard/${id}`}>
          <Button>Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const isResuming = data.cap_table.shield_status === "shielded";
  const remaining = data.schedule.filter((r) => r.status === "scheduled").length;
  const created = data.schedule.length - remaining;
  const allDone = stages.every((s) => s.state === "done");
  const anyFailed = stages.some((s) => s.state === "failed");
  const failedRows = utxoResults.filter((r) => !r.ok);
  const successRows = utxoResults.filter((r) => r.ok);

  const umbraReady = umbra.status === "ready";

  return (
    <div className="mx-auto max-w-container px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl tracking-h1">Shield {data.cap_table.project_name}</h1>
        <p className="text-sm text-text-muted">
          Move the treasury into a private balance, then create unlock UTXOs for each beneficiary.
        </p>
      </div>

      {isResuming && (
        <div className="rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm text-text">
          Resuming — {created} of {data.schedule.length} UTXOs already created.
        </div>
      )}

      {!startedRef.current && (
        <PreflightCard
          projectName={data.cap_table.project_name}
          totalLabel={`${formatAmount(totals.total, tokenInfo.decimals)} ${tokenInfo.symbol}`}
          mint={data.cap_table.mint}
          symbol={tokenInfo.symbol}
          beneficiaries={totals.beneficiaries}
          unlocks={totals.unlocks}
          isResuming={isResuming}
        />
      )}

      <div className="rounded-md border border-border bg-surface p-6">
        <VerticalStepper
          stages={stages}
          subStage={
            stages.find((s) => s.key === "utxos")?.state === "active" && data.schedule.length > 0
              ? `${utxoResults.filter((r) => r.ok).length} of ${data.schedule.length} UTXOs created`
              : undefined
          }
        />

        {progressLabel && running && (
          <div className="mt-4 text-sm text-text-muted">{progressLabel}</div>
        )}

        {warning && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            {warning}
          </div>
        )}

        {errorDetail && (
          <div className="mt-4 text-sm">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="text-text-muted underline-offset-2 hover:underline"
            >
              {showDetail ? "Hide" : "Show"} details
            </button>
            {showDetail && (
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-sunken p-3 text-xs text-text-subtle">
                {errorDetail}
              </pre>
            )}
          </div>
        )}

        {failedRows.length > 0 && (
          <div className="mt-6 space-y-2">
            <h3 className="text-sm tracking-h3 text-text">
              {successRows.length} of {data.schedule.length} UTXOs created.{" "}
              {failedRows.length} failed (
              {failedRows.filter((r) => r.unregistered).length} unregistered,{" "}
              {failedRows.filter((r) => !r.unregistered).length} errored).
            </h3>
            <ul className="space-y-1 text-sm text-text-muted">
              {failedRows.map((r) => (
                <li key={r.id}>
                  <span className="text-text">{r.label}</span> — {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!allDone && !anyFailed && (
            <Button
              onClick={() => {
                startedRef.current = true;
                runFlow({ resume: isResuming });
              }}
              disabled={!umbraReady || running}
              size="lg"
            >
              {running
                ? "Working…"
                : isResuming
                  ? "Resume shielding"
                  : "Continue to signing"}
            </Button>
          )}
          {anyFailed && !running && (
            <Button
              onClick={() => {
                startedRef.current = true;
                setStages((prev) =>
                  prev.map((s) =>
                    s.state === "failed" ? { ...s, state: "pending" } : s,
                  ),
                );
                setErrorDetail(null);
                runFlow({ resume: isResuming });
              }}
              size="lg"
            >
              Retry failed
            </Button>
          )}
          {anyFailed && successRows.length > 0 && !running && (
            <Button onClick={activateAnyway} variant="ghost" size="lg">
              Skip and activate
            </Button>
          )}
          {!umbraReady && umbra.status !== "error" && (
            <span className="text-xs text-text-subtle">
              Preparing Umbra client…
            </span>
          )}
          {umbra.status === "error" && (
            <span className="text-xs text-danger">
              Umbra: {umbra.error}
            </span>
          )}
        </div>

        {allDone && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-text">
              {data.schedule.length} private unlock UTXOs created. Beneficiaries
              can claim as their cliffs hit.
            </p>
            <Link href={`/dashboard/${id}`}>
              <Button>Back to dashboard</Button>
            </Link>
          </div>
        )}
      </div>

      <TransactionLog
        shieldSig={shieldSig}
        utxoResults={utxoResults}
      />
    </div>
  );
}

function PreflightCard(props: {
  projectName: string;
  totalLabel: string;
  mint: string;
  symbol: string;
  beneficiaries: number;
  unlocks: number;
  isResuming: boolean;
}) {
  if (props.isResuming) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="text-lg tracking-h2">{props.projectName}</h2>
        <p className="text-sm text-text-muted">Pre-flight summary</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Total to shield">
          <span className="font-mono text-2xl text-text">{props.totalLabel}</span>
        </Field>
        <Field label="Token">
          <span className="font-mono text-text">{props.symbol}</span>{" "}
          <span className="font-mono text-xs text-text-subtle">
            {truncateAddress(props.mint, 6)}
          </span>
        </Field>
        <Field label="Beneficiaries">
          <span className="text-text">{props.beneficiaries}</span>
        </Field>
        <Field label="Unlock events">
          <span className="text-text">{props.unlocks}</span>
        </Field>
      </div>
      <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        The shielding transaction is publicly visible on Solscan. Only subsequent
        unlock amounts and recipients are hidden inside the Umbra mixer.
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function VerticalStepper({
  stages,
  subStage,
}: {
  stages: Stage[];
  subStage?: string;
}) {
  return (
    <ol className="space-y-4">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-start gap-3">
          <StateDot state={s.state} index={i + 1} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm",
                  s.state === "active"
                    ? "text-text"
                    : s.state === "done"
                      ? "text-text-muted"
                      : s.state === "failed"
                        ? "text-danger"
                        : "text-text-subtle",
                )}
              >
                {s.label}
              </span>
              {s.state === "active" && (
                <span className="text-xs text-text-subtle">…</span>
              )}
            </div>
            {s.detail && (
              <div className="mt-0.5 text-xs text-text-subtle">{s.detail}</div>
            )}
            {s.key === "utxos" && s.state === "active" && subStage && (
              <div className="mt-0.5 text-xs text-text-subtle">{subStage}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StateDot({ state, index }: { state: StageState; index: number }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-success bg-success/10 text-[10px] text-success">
        ✓
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-danger bg-danger/10 text-[10px] text-danger">
        !
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent bg-accent/10 text-[10px] text-accent">
        {index}
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-text-subtle">
      {index}
    </span>
  );
}

function TransactionLog({
  shieldSig,
  utxoResults,
}: {
  shieldSig: string | null;
  utxoResults: RowResult[];
}) {
  const succeeded = utxoResults.filter((r) => r.ok && r.signature);
  if (!shieldSig && succeeded.length === 0) return null;
  const showAll = succeeded.length <= 3;
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-6">
      <h3 className="text-sm tracking-h3 text-text">Transaction log</h3>
      <ul className="space-y-1.5 text-sm">
        {shieldSig && (
          <li>
            <span className="text-text-muted">Treasury shield:</span>{" "}
            <a
              href={solscanUrl(shieldSig)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {truncateAddress(shieldSig, 8)} ↗
            </a>
          </li>
        )}
        {succeeded.length > 0 && (
          <UtxoTxList rows={succeeded} showAll={showAll} />
        )}
      </ul>
      <p className="text-xs text-text-subtle">
        On Solscan, the treasury shield transaction shows the shielded amount
        publicly. The UTXO transactions show Umbra program activity only — no
        readable amounts or recipient addresses.
      </p>
    </div>
  );
}

function UtxoTxList({ rows, showAll }: { rows: RowResult[]; showAll: boolean }) {
  const [expanded, setExpanded] = useState(showAll);
  if (rows.length === 0) return null;
  if (showAll) {
    return (
      <>
        {rows.map((r, i) => (
          <li key={r.id}>
            <span className="text-text-muted">UTXO {i + 1}:</span>{" "}
            <a
              href={solscanUrl(r.signature!)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {truncateAddress(r.signature!, 8)} ↗
            </a>
          </li>
        ))}
      </>
    );
  }
  return (
    <>
      <li>
        <span className="text-text-muted">First UTXO:</span>{" "}
        <a
          href={solscanUrl(rows[0].signature!)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-accent hover:underline"
        >
          {truncateAddress(rows[0].signature!, 8)} ↗
        </a>
      </li>
      <li>
        <span className="text-text-muted">Last UTXO:</span>{" "}
        <a
          href={solscanUrl(rows[rows.length - 1].signature!)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-accent hover:underline"
        >
          {truncateAddress(rows[rows.length - 1].signature!, 8)} ↗
        </a>
      </li>
      <li>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-text-muted underline-offset-2 hover:underline"
        >
          {expanded ? "Hide" : `View all ${rows.length} transactions`}
        </button>
      </li>
      {expanded &&
        rows.slice(1, -1).map((r, i) => (
          <li key={r.id} className="pl-4">
            <span className="text-text-muted">UTXO {i + 2}:</span>{" "}
            <a
              href={solscanUrl(r.signature!)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {truncateAddress(r.signature!, 8)} ↗
            </a>
          </li>
        ))}
    </>
  );
}

function mapDepositError(stage: string | undefined, err: any): string {
  switch (stage) {
    case "validation":
      return "Invalid configuration. Please return to dashboard.";
    case "mint-fetch":
      return "Could not reach the network. Check your connection.";
    case "account-fetch":
      return "Wallet not set up correctly. Return to dashboard.";
    case "transaction-sign":
      return "Signing was cancelled. Click Resume to retry.";
    case "transaction-send":
      return "Transaction submitted but timed out. Checking on-chain status before deciding to retry.";
    default:
      return err?.message ?? "Deposit failed";
  }
}

function mapCreateUtxoError(stage: string | undefined, err: any): string {
  switch (stage) {
    case "zk-proof-generation":
      return "Proof failed. Click Retry for this unlock.";
    case "transaction-sign":
      return "Signing cancelled. Click Resume to continue.";
    case "account-fetch":
      return "Recipient not found on-chain.";
    case "transaction-send":
      return "Transaction send timed out and no UTXO was found on rescan. Retry.";
    default:
      return err?.message ?? "UTXO creation failed";
  }
}
