"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/brand/Stepper";
import { TOKENS, type TokenSymbol } from "@/lib/tokens";
import { cn, formatAmount, truncateAddress } from "@/lib/utils";
import {
  generateSchedule,
  type BeneficiaryInput,
  type Interval,
} from "@/lib/schedule";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { BeneficiaryRegistration } from "./BeneficiaryRegistration";

type Row = {
  id: string;
  label: string;
  wallet: string;
  walletValid: boolean | null;
  allocation: string;
  cliff: string;
  vest: string;
  interval: Interval;
};

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";

function newRow(): Row {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: "",
    wallet: "",
    walletValid: null,
    allocation: "",
    cliff: "0",
    vest: "12",
    interval: "Monthly",
  };
}

function validatePubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function toBaseUnits(value: string, decimals: number): bigint | null {
  if (!value || isNaN(Number(value))) return null;
  const [whole, frac = ""] = value.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

export function CreateVestFlow() {
  const router = useRouter();
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [budget, setBudget] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [testMode, setTestMode] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tok = TOKENS[token];

  const beneficiaries: BeneficiaryInput[] = useMemo(() => {
    return rows
      .filter((r) => r.label && r.wallet && r.walletValid && r.allocation)
      .map((r) => ({
        label: r.label,
        wallet: r.wallet,
        allocation: toBaseUnits(r.allocation, tok.decimals) ?? 0n,
        cliff_months: Number(r.cliff) || 0,
        vest_months: Number(r.vest) || 0,
        interval: r.interval,
      }))
      .filter((b) => b.allocation > 0n && b.vest_months > b.cliff_months);
  }, [rows, tok.decimals]);

  const sumBase = beneficiaries.reduce((acc, b) => acc + b.allocation, 0n);
  const schedulePreview = useMemo(
    () =>
      generateSchedule({
        beneficiaries,
        start_unix: Math.floor(Date.now() / 1000),
        test_mode_seconds: testMode,
      }),
    [beneficiaries, testMode],
  );
  const unlockCount = schedulePreview.length;

  const basicsValid = name.trim().length > 0 && name.length <= 48;

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function applyCsv() {
    const newRows: Row[] = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, wallet, allocation, cliff, vest, intervalRaw] = line
          .split(",")
          .map((p) => p.trim());
        const interval: Interval =
          (intervalRaw ?? "").toLowerCase().startsWith("q")
            ? "Quarterly"
            : "Monthly";
        return {
          id: Math.random().toString(36).slice(2, 10),
          label: label ?? "",
          wallet: wallet ?? "",
          walletValid: wallet ? validatePubkey(wallet) : null,
          allocation: allocation ?? "",
          cliff: cliff ?? "0",
          vest: vest ?? "12",
          interval,
        };
      });
    if (newRows.length > 0) setRows(newRows);
    setCsvOpen(false);
    setCsvText("");
  }

  async function submit(asDraft: boolean) {
    if (!wallet.publicKey) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const auth = await signAuth(wallet, "create_cap_table");
      const res = await fetch("/api/cap-tables", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(auth),
        },
        body: JSON.stringify({
          project_name: name,
          mint: tok.mint,
          total: sumBase.toString(),
          schedule: schedulePreview,
          test_mode: testMode,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const { id } = await res.json();
      router.push(asDraft ? "/dashboard" : `/dashboard/${id}`);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Failed to save");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-container px-6 py-10">
      <Stepper steps={["Basics", "Beneficiaries", "Review"]} current={step} />

      <div className="mt-10">
        {step === 0 && (
          <BasicsStep
            name={name}
            setName={setName}
            token={token}
            setToken={setToken}
            budget={budget}
            setBudget={setBudget}
          />
        )}

        {step === 1 && (
          <BeneficiariesStep
            rows={rows}
            setRows={setRows}
            updateRow={updateRow}
            tokenSymbol={tok.symbol}
            sumBase={sumBase}
            decimals={tok.decimals}
            unlockCount={unlockCount}
            testMode={testMode}
            setTestMode={setTestMode}
            csvOpen={csvOpen}
            setCsvOpen={setCsvOpen}
            csvText={csvText}
            setCsvText={setCsvText}
            applyCsv={applyCsv}
          />
        )}

        {step === 2 && (
          <ReviewStep
            name={name}
            tokenSymbol={tok.symbol}
            mint={tok.mint}
            sumBase={sumBase}
            decimals={tok.decimals}
            beneficiaryCount={beneficiaries.length}
            unlockCount={unlockCount}
          />
        )}
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
        <div>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {submitError && (
            <span className="text-sm text-danger">{submitError}</span>
          )}
          {step === 0 && (
            <Button onClick={() => setStep(1)} disabled={!basicsValid}>
              Continue
            </Button>
          )}
          {step === 1 && (
            <Button
              onClick={() => setStep(2)}
              disabled={beneficiaries.length === 0 || unlockCount === 0}
            >
              Continue
            </Button>
          )}
          {step === 2 && (
            <>
              <Button
                variant="ghost"
                onClick={() => submit(true)}
                disabled={submitting}
              >
                Save as draft
              </Button>
              <Button onClick={() => submit(false)} disabled={submitting}>
                {submitting ? "Saving…" : "Save and proceed to shielding"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BasicsStep(props: {
  name: string;
  setName: (s: string) => void;
  token: TokenSymbol;
  setToken: (t: TokenSymbol) => void;
  budget: string;
  setBudget: (s: string) => void;
}) {
  const { name, setName, token, setToken, budget, setBudget } = props;
  return (
    <div className="max-w-prose space-y-6">
      <div className="space-y-2">
        <label className="text-sm text-text-muted">Project name</label>
        <Input
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Series A"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-text-muted">Token</label>
        <div className="inline-flex rounded-md border border-border bg-surface-sunken p-1">
          {(["USDC", "SOL"] as TokenSymbol[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setToken(t)}
              className={cn(
                "h-8 rounded px-4 text-sm transition-colors",
                token === t
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-text-muted">Total budget</label>
        <div className="relative max-w-xs">
          <Input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-subtle">
            {token}
          </span>
        </div>
        <p className="text-xs text-text-muted">
          Used for sanity check. Actual total computed from beneficiary allocations.
        </p>
      </div>
    </div>
  );
}

function BeneficiariesStep(props: {
  rows: Row[];
  setRows: (r: Row[]) => void;
  updateRow: (id: string, patch: Partial<Row>) => void;
  tokenSymbol: string;
  sumBase: bigint;
  decimals: number;
  unlockCount: number;
  testMode: boolean;
  setTestMode: (v: boolean) => void;
  csvOpen: boolean;
  setCsvOpen: (v: boolean) => void;
  csvText: string;
  setCsvText: (v: string) => void;
  applyCsv: () => void;
}) {
  const {
    rows,
    setRows,
    updateRow,
    tokenSymbol,
    sumBase,
    decimals,
    unlockCount,
    testMode,
    setTestMode,
    csvOpen,
    setCsvOpen,
    csvText,
    setCsvText,
    applyCsv,
  } = props;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl tracking-h2">Beneficiaries</h2>
        <Button variant="ghost" size="sm" onClick={() => setCsvOpen(true)}>
          Paste from CSV
        </Button>
      </div>

      {csvOpen && (
        <div className="space-y-3 rounded-md border border-border bg-surface-sunken p-4">
          <div className="text-sm text-text-muted">
            Paste rows: <span className="font-mono">label,wallet,allocation,cliff_months,vest_months,interval</span>
          </div>
          <textarea
            className="h-40 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Alice,7xKX...,100000,3,24,Monthly"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCsvOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyCsv}>
              Apply
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
              <th className="py-2 pr-3 font-normal">Label</th>
              <th className="py-2 pr-3 font-normal">Wallet</th>
              <th className="py-2 pr-3 font-normal">Allocation</th>
              <th className="py-2 pr-3 font-normal">Cliff (mo)</th>
              <th className="py-2 pr-3 font-normal">Vest period (mo)</th>
              <th className="py-2 pr-3 font-normal">Interval</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="py-2 pr-3">
                  <Input
                    maxLength={32}
                    value={r.label}
                    onChange={(e) =>
                      updateRow(r.id, { label: e.target.value })
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    value={r.wallet}
                    onChange={(e) =>
                      updateRow(r.id, {
                        wallet: e.target.value,
                        walletValid: null,
                      })
                    }
                    onBlur={(e) =>
                      updateRow(r.id, {
                        walletValid: e.target.value
                          ? validatePubkey(e.target.value)
                          : null,
                      })
                    }
                    className={cn(
                      "font-mono text-xs",
                      r.walletValid === false &&
                        "ring-2 ring-danger",
                    )}
                  />
                  {r.walletValid === false && (
                    <div className="mt-1 text-xs text-danger">Invalid pubkey</div>
                  )}
                  {r.walletValid && (
                    <div className="mt-1">
                      <BeneficiaryRegistration
                        pubkey={r.wallet.trim()}
                        valid={r.walletValid}
                      />
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <div className="relative">
                    <Input
                      type="number"
                      value={r.allocation}
                      onChange={(e) =>
                        updateRow(r.id, { allocation: e.target.value })
                      }
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-subtle">
                      {tokenSymbol}
                    </span>
                  </div>
                </td>
                <td className="py-2 pr-3 w-24">
                  <Input
                    type="number"
                    min={0}
                    max={48}
                    value={r.cliff}
                    onChange={(e) => updateRow(r.id, { cliff: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3 w-28">
                  <Input
                    type="number"
                    min={1}
                    value={r.vest}
                    onChange={(e) => updateRow(r.id, { vest: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3 w-32">
                  <select
                    value={r.interval}
                    onChange={(e) =>
                      updateRow(r.id, { interval: e.target.value as Interval })
                    }
                    className="h-10 w-full rounded-md border border-border bg-surface-sunken px-2 text-sm"
                  >
                    <option>Monthly</option>
                    <option>Quarterly</option>
                  </select>
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setRows(rows.filter((x) => x.id !== r.id))
                    }
                    className="text-text-subtle hover:text-danger"
                    aria-label="Remove row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRows([...rows, newRow()])}
        >
          + Add row
        </Button>
        <div className="text-sm text-text-muted">
          Sum:{" "}
          <span className="font-mono text-text">
            {formatAmount(sumBase, decimals)} {tokenSymbol}
          </span>{" "}
          across {rows.length} beneficiaries, {unlockCount} unlock events.
        </div>
      </div>

      {unlockCount > 50 && (
        <div className="rounded-md border border-warning px-4 py-3 text-sm text-warning">
          Large schedules will be created in batches across multiple transactions
          during shielding.
        </div>
      )}

      {NETWORK === "devnet" && (
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
          Use seconds instead of months for testing (development only).
        </label>
      )}
    </div>
  );
}

function ReviewStep(props: {
  name: string;
  tokenSymbol: string;
  mint: string;
  sumBase: bigint;
  decimals: number;
  beneficiaryCount: number;
  unlockCount: number;
}) {
  const { name, tokenSymbol, mint, sumBase, decimals, beneficiaryCount, unlockCount } = props;
  return (
    <div className="max-w-prose space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <dl className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
          <dt className="text-text-muted">Project</dt>
          <dd className="text-text">{name}</dd>
          <dt className="text-text-muted">Token</dt>
          <dd className="font-mono text-xs">
            {tokenSymbol} <span className="text-text-subtle">{truncateAddress(mint, 6)}</span>
          </dd>
          <dt className="text-text-muted">Total to shield</dt>
          <dd className="font-mono text-text">
            {formatAmount(sumBase, decimals)} {tokenSymbol}
          </dd>
          <dt className="text-text-muted">Beneficiaries</dt>
          <dd className="text-text">{beneficiaryCount}</dd>
          <dt className="text-text-muted">Unlock events</dt>
          <dd className="text-text">{unlockCount}</dd>
        </dl>
      </div>

      <div className="rounded-md bg-surface-sunken px-4 py-3 text-xs text-text-muted">
        Your treasury will first be shielded into an encrypted balance. Then unlock
        UTXOs will be created from that balance per the schedule. Beneficiaries
        claim privately; Umbra fees apply at withdrawal time.
      </div>
    </div>
  );
}
