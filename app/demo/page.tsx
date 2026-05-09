"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { Button } from "@/components/ui/button";
import { signAuth, authHeaders } from "@/lib/walletAuth";

const ALLOWED_WALLET = process.env.NEXT_PUBLIC_DEMO_RESET_WALLET ?? "";

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running"; lines: string[] }
  | { kind: "done"; capTableId: string; lines: string[] }
  | { kind: "error"; message: string; lines: string[] };

export default function DemoPage() {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <DemoBody />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}

function DemoBody() {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const connected = wallet.publicKey?.toBase58();
  const isAllowed =
    !!ALLOWED_WALLET && !!connected && connected === ALLOWED_WALLET;

  const run = async () => {
    const lines: string[] = [];
    setPhase({ kind: "running", lines: [...lines, "Signing reset request…"] });
    try {
      const auth = await signAuth(wallet, "demo_seed");
      lines.push("Wiping prior cap tables, schedules, and viewing keys…");
      setPhase({ kind: "running", lines: [...lines] });
      const res = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `seed failed (${res.status})`);
      }
      const j = (await res.json()) as {
        ok: boolean;
        cap_table_id: string;
        notes: string[];
      };
      lines.push("Inserted Acme Protocol Token Plan + 12 unlocks.");
      lines.push("Marked 2 rows as already-claimed with mock signatures.");
      lines.push("Done.");
      setPhase({ kind: "done", capTableId: j.cap_table_id, lines: [...lines] });
    } catch (e: any) {
      setPhase({
        kind: "error",
        message: e?.message ?? "Failed",
        lines: [...lines],
      });
    }
  };

  return (
    <div className="mx-auto max-w-[640px] px-6 py-10 space-y-6">
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-wider text-text-subtle">
          Demo seed
        </span>
        <h1 className="text-3xl tracking-h1">Reset and seed sample vest.</h1>
        <p className="text-sm text-text-muted">
          Wipes this wallet&rsquo;s cap tables, unlock schedules, and viewing
          keys, then inserts a sample &ldquo;Acme Protocol Token Plan&rdquo;
          with 12 unlocks across 3 beneficiaries (2 pre-marked as claimed).
          Run the shield flow next to dispatch real on-chain UTXOs for the
          remaining 10 rows.
        </p>
      </div>

      {!ALLOWED_WALLET && (
        <Banner kind="warning">
          <span className="font-mono">NEXT_PUBLIC_DEMO_RESET_WALLET</span>{" "}
          is not set. The seed endpoint will refuse to run until you configure
          it.
        </Banner>
      )}

      {ALLOWED_WALLET && connected && !isAllowed && (
        <Banner kind="warning">
          This page is locked to{" "}
          <span className="font-mono">{truncate(ALLOWED_WALLET)}</span>. You
          are connected as{" "}
          <span className="font-mono">{truncate(connected)}</span>. Switch
          wallets to seed.
        </Banner>
      )}

      <div className="space-y-4">
        {phase.kind === "idle" && (
          <Button
            disabled={!isAllowed}
            onClick={() => setPhase({ kind: "confirming" })}
          >
            Reset and seed sample vest
          </Button>
        )}

        {phase.kind === "confirming" && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="text-sm">
              This will{" "}
              <span className="text-warning">delete every cap table</span>{" "}
              owned by this wallet, including viewing keys, and replace them
              with the sample. There is no undo.
            </div>
            <div className="flex gap-2">
              <Button onClick={run}>Confirm reset</Button>
              <Button
                variant="ghost"
                onClick={() => setPhase({ kind: "idle" })}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase.kind === "running" && (
          <Status
            title="Seeding…"
            lines={phase.lines}
          />
        )}

        {phase.kind === "error" && (
          <>
            <Status title="Seed failed" lines={phase.lines} />
            <Banner kind="error">{phase.message}</Banner>
            <Button
              variant="ghost"
              onClick={() => setPhase({ kind: "idle" })}
            >
              Try again
            </Button>
          </>
        )}

        {phase.kind === "done" && (
          <>
            <Status title="Seeded" lines={phase.lines} />
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/${phase.capTableId}/shield`}>
                <Button>Begin shielding</Button>
              </Link>
              <Link href={`/dashboard/${phase.capTableId}`}>
                <Button variant="ghost">Open dashboard</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => setPhase({ kind: "idle" })}
              >
                Reset again
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="text-xs text-text-subtle">
        Recording-time tip: after &ldquo;Begin shielding&rdquo; finishes, head
        back to the dashboard and walk through generating master / mint /
        monthly viewing keys live.
      </div>
    </div>
  );
}

function Status({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="text-sm text-text">{title}</div>
      <ul className="space-y-1 text-xs text-text-muted">
        {lines.map((l, i) => (
          <li key={i} className="font-mono">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "warning" | "error";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error"
      ? "border-danger text-danger"
      : "border-warning text-warning";
  return (
    <div
      className={`rounded-md border ${cls} bg-surface-sunken px-3 py-2 text-xs`}
    >
      {children}
    </div>
  );
}

function truncate(s: string): string {
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
