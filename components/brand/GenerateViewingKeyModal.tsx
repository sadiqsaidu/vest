"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUmbraClient } from "@/lib/umbra/provider";
import {
  generateMasterKey,
  generateMintKey,
  generateMonthlyKey,
  generateYearlyKey,
  type ViewingKeyResult,
  type ViewingKeyScope,
} from "@/lib/umbra/viewing-keys";
import { wrapKey } from "@/lib/viewingKeys/envelope";
import { signAuth, authHeaders } from "@/lib/walletAuth";
import { tokenSymbolFromMint } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type Step = "scope" | "configure" | "generating" | "done" | "error";

export function GenerateViewingKeyModal({
  capTableId,
  capTableMint,
  open,
  onClose,
  onCreated,
}: {
  capTableId: string;
  capTableMint: string;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const wallet = useWallet();
  const umbra = useUmbraClient();
  const [step, setStep] = useState<Step>("scope");
  const [scope, setScope] = useState<ViewingKeyScope>("master");
  const [recipientLabel, setRecipientLabel] = useState("");
  const now = new Date();
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [month, setMonth] = useState<number>(now.getUTCMonth() + 1);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    accessToken: string;
    auditUrl: string;
    keyHex: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset to a fresh state on close.
      const t = setTimeout(() => {
        setStep("scope");
        setScope("master");
        setRecipientLabel("");
        setYear(now.getUTCFullYear());
        setMonth(now.getUTCMonth() + 1);
        setExpiresAt("");
        setError(null);
        setResult(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const symbol = useMemo(
    () => tokenSymbolFromMint(capTableMint),
    [capTableMint],
  );

  if (!open) return null;

  const handleGenerate = async () => {
    setError(null);
    if (!recipientLabel.trim()) {
      setError("Please name the recipient.");
      return;
    }
    if (umbra.status !== "ready") {
      setError("Umbra client not ready — connect your wallet and retry.");
      return;
    }

    setStep("generating");
    try {
      // Step A — derive the actual viewing key in-browser via the SDK.
      let vk: ViewingKeyResult;
      switch (scope) {
        case "master":
          vk = await generateMasterKey((umbra as any).client);
          break;
        case "mint":
          vk = await generateMintKey((umbra as any).client, capTableMint);
          break;
        case "yearly":
          vk = await generateYearlyKey(
            (umbra as any).client,
            capTableMint,
            year,
          );
          break;
        case "monthly":
          vk = await generateMonthlyKey(
            (umbra as any).client,
            capTableMint,
            year,
            month,
          );
          break;
      }

      // Step B — prepare the envelope on the server. Server holds an
      // access_token; we never store the viewing key in plaintext.
      const auth = await signAuth(wallet, "viewing_key_prepare");
      const prepRes = await fetch("/api/viewing-keys/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth) },
        body: JSON.stringify({
          cap_table_id: capTableId,
          scope,
          scope_params: vk.scopeParams,
          recipient_label: recipientLabel.trim(),
          expires_at: expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
        }),
      });
      if (!prepRes.ok) {
        const e = await prepRes.json().catch(() => ({}));
        throw new Error(e?.error ?? `prepare failed (${prepRes.status})`);
      }
      const { envelope_id, access_token } = (await prepRes.json()) as {
        envelope_id: string;
        access_token: string;
      };

      // Step C — wrap the key client-side (HKDF + AES-GCM under the token).
      const encrypted = await wrapKey(access_token, envelope_id, vk.keyBytes);

      // Step D — finalize.
      const auth2 = await signAuth(wallet, "viewing_key_finalize");
      const finalRes = await fetch("/api/viewing-keys/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth2) },
        body: JSON.stringify({
          envelope_id,
          encrypted_key_payload: encrypted,
        }),
      });
      if (!finalRes.ok) {
        const e = await finalRes.json().catch(() => ({}));
        throw new Error(e?.error ?? `finalize failed (${finalRes.status})`);
      }

      const auditUrl = `${window.location.origin}/audit?key=${encodeURIComponent(
        access_token,
      )}`;
      setResult({ accessToken: access_token, auditUrl, keyHex: vk.keyHex });
      setStep("done");
      onCreated?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate");
      setStep("error");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.3)" }}
    >
      <div
        className="relative w-full max-w-[560px] rounded-xl border border-border bg-surface p-6"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded p-1 text-text-subtle hover:text-text"
        >
          <X size={16} />
        </button>

        {step === "scope" && (
          <ScopeStep
            scope={scope}
            onPick={(s) => setScope(s)}
            onContinue={() => setStep("configure")}
            mintSymbol={symbol}
          />
        )}

        {step === "configure" && (
          <ConfigureStep
            scope={scope}
            recipientLabel={recipientLabel}
            onRecipientLabelChange={setRecipientLabel}
            year={year}
            onYearChange={setYear}
            month={month}
            onMonthChange={setMonth}
            mintSymbol={symbol}
            expiresAt={expiresAt}
            onExpiresAtChange={setExpiresAt}
            onBack={() => setStep("scope")}
            onGenerate={handleGenerate}
            disabled={umbra.status !== "ready"}
            umbraStatus={umbra.status}
          />
        )}

        {step === "generating" && <GeneratingStep />}

        {step === "error" && (
          <ErrorStep
            error={error}
            onBack={() => setStep("configure")}
            onCancel={onClose}
          />
        )}

        {step === "done" && result && (
          <DoneStep
            accessToken={result.accessToken}
            auditUrl={result.auditUrl}
            keyHex={result.keyHex}
            recipient={recipientLabel}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

/* -- Step 1 --------------------------------------------------------------- */

function ScopeStep({
  scope,
  onPick,
  onContinue,
  mintSymbol,
}: {
  scope: ViewingKeyScope;
  onPick: (s: ViewingKeyScope) => void;
  onContinue: () => void;
  mintSymbol: string;
}) {
  const cards: {
    s: ViewingKeyScope;
    title: string;
    sub: string;
    use: string;
  }[] = [
    {
      s: "master",
      title: "Master",
      sub: "Full visibility. All tokens, all years.",
      use: "External auditor for annual review.",
    },
    {
      s: "mint",
      title: "Per-token (Mint)",
      sub: "One token's activity only — across all time.",
      use: `Auditor reviewing only ${mintSymbol} operations.`,
    },
    {
      s: "yearly",
      title: "Yearly",
      sub: "One year's activity, all tokens.",
      use: "Tax preparer for a specific tax year.",
    },
    {
      s: "monthly",
      title: "Monthly",
      sub: "One month's activity, all tokens.",
      use: "M&A diligence with a tight scope.",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-text-subtle">
          Step 1 of 3
        </span>
        <h2 className="text-xl tracking-h2 text-text">Choose scope</h2>
        <p className="text-sm text-text-muted">
          Each viewing key reveals a slice of activity. Narrower scopes
          minimise disclosure.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.s}
            type="button"
            onClick={() => onPick(c.s)}
            className={cn(
              "rounded-lg border bg-surface-sunken/50 p-4 text-left transition-colors",
              scope === c.s
                ? "border-text"
                : "border-border hover:border-border-strong",
            )}
          >
            <div className="text-sm text-text">{c.title}</div>
            <div className="mt-1 text-xs text-text-muted">{c.sub}</div>
            <div className="mt-2 text-[11px] text-text-subtle">{c.use}</div>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

/* -- Step 2 --------------------------------------------------------------- */

function ConfigureStep({
  scope,
  recipientLabel,
  onRecipientLabelChange,
  year,
  onYearChange,
  month,
  onMonthChange,
  mintSymbol,
  expiresAt,
  onExpiresAtChange,
  onBack,
  onGenerate,
  disabled,
  umbraStatus,
}: {
  scope: ViewingKeyScope;
  recipientLabel: string;
  onRecipientLabelChange: (s: string) => void;
  year: number;
  onYearChange: (y: number) => void;
  month: number;
  onMonthChange: (m: number) => void;
  mintSymbol: string;
  expiresAt: string;
  onExpiresAtChange: (s: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  disabled: boolean;
  umbraStatus: string;
}) {
  const yearOptions = useMemo(() => {
    const cur = new Date().getUTCFullYear();
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  }, []);
  const monthOptions = [
    [1, "Jan"],
    [2, "Feb"],
    [3, "Mar"],
    [4, "Apr"],
    [5, "May"],
    [6, "Jun"],
    [7, "Jul"],
    [8, "Aug"],
    [9, "Sep"],
    [10, "Oct"],
    [11, "Nov"],
    [12, "Dec"],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-text-subtle">
          Step 2 of 3
        </span>
        <h2 className="text-xl tracking-h2 text-text">Configure</h2>
      </div>

      <div className="space-y-3">
        <Field label="Recipient label">
          <Input
            placeholder="Smith LLP — Tax Year 2025"
            value={recipientLabel}
            onChange={(e) => onRecipientLabelChange(e.target.value)}
            maxLength={200}
          />
        </Field>

        {scope === "mint" && (
          <Field label="Token">
            <div className="font-mono text-sm text-text">{mintSymbol}</div>
            <div className="text-xs text-text-subtle">
              Defaults to this cap table&rsquo;s token.
            </div>
          </Field>
        )}

        {(scope === "yearly" || scope === "monthly") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <select
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-border bg-surface-sunken px-3 text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
            {scope === "monthly" && (
              <Field label="Month">
                <select
                  value={month}
                  onChange={(e) => onMonthChange(Number(e.target.value))}
                  className="h-10 w-full rounded-md border border-border bg-surface-sunken px-3 text-sm"
                >
                  {monthOptions.map(([m, name]) => (
                    <option key={m} value={m}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        {(scope === "yearly" || scope === "monthly") && (
          <div className="rounded border border-border bg-surface-sunken/50 px-3 py-2 text-xs text-text-muted">
            Token defaults to <span className="font-mono">{mintSymbol}</span>.
            Yearly and monthly keys are derived under a specific token.
          </div>
        )}

        <Field label="Expires (optional)">
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => onExpiresAtChange(e.target.value)}
          />
          <div className="text-xs text-text-subtle">
            Vest enforces expiration by refusing to decrypt past this time.
            The underlying Umbra key cannot itself be revoked once shared.
          </div>
        </Field>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {umbraStatus !== "ready" && (
            <span className="text-xs text-text-subtle">
              {umbraStatus === "loading"
                ? "Connecting Umbra…"
                : "Connect your wallet"}
            </span>
          )}
          <Button onClick={onGenerate} disabled={disabled}>
            Sign and generate
          </Button>
        </div>
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
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <div className="space-y-1">{children}</div>
    </label>
  );
}

/* -- Generating ----------------------------------------------------------- */

function GeneratingStep() {
  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle">
        Generating
      </span>
      <h2 className="text-xl tracking-h2 text-text">
        Deriving viewing key…
      </h2>
      <p className="text-sm text-text-muted">
        Sign with your wallet to derive the master seed if prompted. The key
        is computed in your browser and wrapped before it leaves your machine.
      </p>
      <ol className="space-y-1 text-sm text-text-muted">
        <li>1. Derive viewing key (Umbra SDK, Poseidon hierarchy)</li>
        <li>2. Reserve envelope (server)</li>
        <li>3. Wrap key (HKDF → AES-GCM, in browser)</li>
        <li>4. Finalise envelope (server)</li>
      </ol>
    </div>
  );
}

/* -- Error ---------------------------------------------------------------- */

function ErrorStep({
  error,
  onBack,
  onCancel,
}: {
  error: string | null;
  onBack: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl tracking-h2 text-danger">Couldn&rsquo;t generate</h2>
      <p className="text-sm text-text-muted">{error ?? "Unknown error."}</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onBack}>Try again</Button>
      </div>
    </div>
  );
}

/* -- Done ----------------------------------------------------------------- */

function DoneStep({
  accessToken,
  auditUrl,
  keyHex,
  recipient,
  onClose,
}: {
  accessToken: string;
  auditUrl: string;
  keyHex: string;
  recipient: string;
  onClose: () => void;
}) {
  const mailto = `mailto:?subject=${encodeURIComponent(
    `Vest viewing key for ${recipient}`,
  )}&body=${encodeURIComponent(
    `Access link:\n${auditUrl}\n\nThis key is read-only and scoped. Open the link to decrypt the records you've been granted access to.`,
  )}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-text-subtle">
          Step 3 of 3
        </span>
        <h2 className="text-xl tracking-h2 text-text">
          Viewing key generated.
        </h2>
        <p className="text-sm text-text-muted">
          For <span className="text-text">{recipient}</span>.
        </p>
      </div>

      <CopyBlock label="Access token" value={accessToken} mono />
      <CopyBlock label="Audit link" value={auditUrl} />
      <details className="text-xs text-text-subtle">
        <summary className="cursor-pointer">
          Show derived viewing key (BN254, hex)
        </summary>
        <div className="mt-2 break-all rounded bg-surface-sunken px-2 py-1.5 font-mono">
          {keyHex}
        </div>
      </details>

      <div
        className="rounded-md border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--warning)",
          color: "var(--warning)",
          background: "rgba(255, 167, 38, 0.06)",
        }}
      >
        This is the only time we&rsquo;ll show this key. Store it securely or
        share via a trusted channel.
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <a href={mailto}>
          <Button variant="ghost">
            <Mail size={14} />
            Send via email
          </Button>
        </a>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function CopyBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <div
          className={cn(
            "min-w-0 flex-1 break-all rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs",
            mono && "font-mono",
          )}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 text-xs text-text hover:border-border-strong"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
