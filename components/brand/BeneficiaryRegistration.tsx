"use client";

import { useEffect, useState } from "react";
import { useUmbraClient } from "@/lib/umbra/provider";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "registered" }
  | { kind: "missing" }
  | { kind: "needs_x25519" }
  | { kind: "invalid" }
  | { kind: "unknown" };

const cache = new Map<string, Status>();

/**
 * Dot indicator next to a beneficiary wallet input. Queries Umbra for the
 * wallet's account state and shows whether it can receive a UTXO.
 *
 * Green = fully registered (X25519 + commitment).
 * Amber = exists but missing X25519 — beneficiary won't be able to receive.
 * Grey = not registered — beneficiary needs to visit /claim.
 */
export function BeneficiaryRegistration({
  pubkey,
  valid,
}: {
  pubkey: string;
  valid: boolean | null;
}) {
  const umbra = useUmbraClient();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!valid || !pubkey) {
      setStatus({ kind: "idle" });
      return;
    }
    const cached = cache.get(pubkey);
    if (cached) {
      setStatus(cached);
      return;
    }
    if (umbra.status !== "ready") {
      setStatus({ kind: "checking" });
      return;
    }
    let cancelled = false;
    const debounce = setTimeout(() => {
      void (async () => {
        setStatus({ kind: "checking" });
        try {
          const { getUserAccountQuerierFunction } = await import(
            "@umbra-privacy/sdk"
          );
          const query = getUserAccountQuerierFunction({
            client: (umbra as any).client,
          });
          const result: any = await query(pubkey as any);
          let next: Status;
          if (result?.state !== "exists") {
            next = { kind: "missing" };
          } else if (!result.data?.isUserAccountX25519KeyRegistered) {
            next = { kind: "needs_x25519" };
          } else {
            next = { kind: "registered" };
          }
          if (cancelled) return;
          cache.set(pubkey, next);
          setStatus(next);
        } catch {
          if (cancelled) return;
          setStatus({ kind: "unknown" });
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, valid, umbra.status]);

  if (!valid) {
    if (valid === false) {
      return (
        <Pill color="text-danger" dot="bg-danger">
          Invalid
        </Pill>
      );
    }
    return null;
  }

  switch (status.kind) {
    case "checking":
      return (
        <Pill color="text-text-subtle" dot="bg-text-subtle">
          Checking…
        </Pill>
      );
    case "registered":
      return (
        <Pill color="text-success" dot="bg-success">
          Registered
        </Pill>
      );
    case "needs_x25519":
      return (
        <Pill color="text-warning" dot="bg-warning">
          Partial — needs X25519
        </Pill>
      );
    case "missing":
      return (
        <Pill color="text-text-muted" dot="bg-text-subtle">
          Not yet registered
        </Pill>
      );
    case "unknown":
      return (
        <Pill color="text-text-muted" dot="bg-text-subtle">
          Status unavailable
        </Pill>
      );
    default:
      return null;
  }
}

function Pill({
  color,
  dot,
  children,
}: {
  color: string;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] ${color}`}
      title="Beneficiary registration status on Umbra"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dot}`}
        style={{ backgroundColor: "currentColor", opacity: 0.85 }}
      />
      {children}
    </span>
  );
}
