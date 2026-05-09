import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { webcrypto } from "crypto";

export const runtime = "nodejs";

const subtle = webcrypto.subtle;

const USDC_DEVNET =
  process.env.NEXT_PUBLIC_USDC_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Mock beneficiary pubkeys + claim tx signatures for the demo. These look
// like real base58 Solana keys/sigs; they intentionally don't resolve on-chain
// — the demo doesn't require these wallets to actually exist for the founder
// flow to render. Beneficiaries used for live demos must be replaced with
// the recording wallets via env override.
const DEMO_BENEFICIARIES = [
  {
    label: "Ada — Engineering Lead",
    wallet:
      process.env.NEXT_PUBLIC_DEMO_BENEFICIARY_1 ??
      "Adagvi8m1zKQwS3GJX1dQTDuKLpzr6PnVCTzN7TgJSvD",
  },
  {
    label: "Boris — Founding PM",
    wallet:
      process.env.NEXT_PUBLIC_DEMO_BENEFICIARY_2 ??
      "BorisLb2DR1dJ6P4TNqXwQ4Y8h2Q6wA3fEf7LbKzhDgZ",
  },
  {
    label: "Cleo — Senior Engineer",
    wallet:
      process.env.NEXT_PUBLIC_DEMO_BENEFICIARY_3 ??
      "CleovB6mnP1Qx1d2jLrK5Y5T7vEd6cQ4JpF3hWwK1NyA",
  },
];

const MOCK_CLAIM_SIG_1 =
  "5LqV9XKJrh1d2P3z9QjT4wB1Rz6nF7kE2vX8YkL9mN3pT4dQzG6vK7wB1rN3yX9LpVjE8fT2C5dM6bA9rW3";
const MOCK_CLAIM_SIG_2 =
  "3M7yPxJrh1d2P3z9QjT4wB1Rz6nF7kE2vX8YkL9mN3pT4dQzG6vK7wB1rN3yX9LpVjE8fT2C5dM6bA9rW3a";

const PER_UNLOCK_AMOUNT = 5_000_000_000n; // 5,000 USDC at 6 decimals
const TOTAL = PER_UNLOCK_AMOUNT * 12n;

async function sha256Hex(input: string): Promise<string> {
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export async function POST(req: Request) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = process.env.NEXT_PUBLIC_DEMO_RESET_WALLET;
  if (!allowed)
    return NextResponse.json(
      { error: "Demo reset disabled (NEXT_PUBLIC_DEMO_RESET_WALLET unset)." },
      { status: 503 },
    );
  if (allowed !== wallet)
    return NextResponse.json(
      { error: "This wallet is not authorised for demo resets." },
      { status: 403 },
    );

  const sb = getSupabaseAdmin();

  // Wipe — viewing_keys + unlock_schedule cascade via cap_tables FK.
  const { error: delVkErr } = await sb
    .from("viewing_keys")
    .delete()
    .eq("founder_wallet", wallet);
  if (delVkErr)
    return NextResponse.json({ error: delVkErr.message }, { status: 500 });

  const { error: delCtErr } = await sb
    .from("cap_tables")
    .delete()
    .eq("founder_wallet", wallet);
  if (delCtErr)
    return NextResponse.json({ error: delCtErr.message }, { status: 500 });

  // Seed sample cap table.
  const projectName = "Acme Protocol Token Plan";

  // Build 12 unlocks: 2 claimed (past), 2 claimable now (past, not claimed),
  // 8 future. Distribute across 3 beneficiaries.
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;

  type SeedRow = {
    beneficiary_idx: number;
    offset_sec: number; // relative to `now`; negative = past
    state: "claimed" | "claimable" | "future";
    claim_sig?: string;
  };
  const rows: SeedRow[] = [
    // Ada — 1 claimed, 1 claimable, 2 future
    { beneficiary_idx: 0, offset_sec: -120 * day, state: "claimed", claim_sig: MOCK_CLAIM_SIG_1 },
    { beneficiary_idx: 0, offset_sec: -10 * day, state: "claimable" },
    { beneficiary_idx: 0, offset_sec: +30 * day, state: "future" },
    { beneficiary_idx: 0, offset_sec: +120 * day, state: "future" },
    // Boris — 1 claimed, 1 claimable, 2 future
    { beneficiary_idx: 1, offset_sec: -90 * day, state: "claimed", claim_sig: MOCK_CLAIM_SIG_2 },
    { beneficiary_idx: 1, offset_sec: -3 * day, state: "claimable" },
    { beneficiary_idx: 1, offset_sec: +60 * day, state: "future" },
    { beneficiary_idx: 1, offset_sec: +150 * day, state: "future" },
    // Cleo — all future
    { beneficiary_idx: 2, offset_sec: +45 * day, state: "future" },
    { beneficiary_idx: 2, offset_sec: +90 * day, state: "future" },
    { beneficiary_idx: 2, offset_sec: +180 * day, state: "future" },
    { beneficiary_idx: 2, offset_sec: +270 * day, state: "future" },
  ];

  // Canonical commitment over schedule (the scaffold uses sha256 of a
  // canonicalised JSON; recompute here so the dashboard's "verify on
  // Solscan" footer has a stable value).
  const canonical = rows
    .map((r) => {
      const b = DEMO_BENEFICIARIES[r.beneficiary_idx];
      return `${b.wallet}|${b.label}|${now + r.offset_sec}|${PER_UNLOCK_AMOUNT.toString()}`;
    })
    .join("\n");
  const commitment = await sha256Hex(canonical);

  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .insert({
      founder_wallet: wallet,
      project_name: projectName,
      mint: USDC_DEVNET,
      total: TOTAL.toString(),
      commitment,
      shield_status: "pending",
      test_mode: true,
    })
    .select("id")
    .single();
  if (ctErr || !ct)
    return NextResponse.json(
      { error: ctErr?.message ?? "Insert failed" },
      { status: 500 },
    );

  const scheduleRows = rows.map((r) => {
    const b = DEMO_BENEFICIARIES[r.beneficiary_idx];
    const claimed = r.state === "claimed";
    return {
      cap_table_id: ct.id,
      beneficiary_wallet: b.wallet,
      beneficiary_label: b.label,
      unlock_timestamp: now + r.offset_sec,
      amount: PER_UNLOCK_AMOUNT.toString(),
      status: claimed ? "claimed" : "scheduled",
      claim_tx_signature: claimed ? r.claim_sig : null,
      claimed_at: claimed
        ? new Date((now + r.offset_sec + 60 * 60) * 1000).toISOString()
        : null,
    };
  });

  const { error: schedErr } = await sb
    .from("unlock_schedule")
    .insert(scheduleRows);
  if (schedErr)
    return NextResponse.json({ error: schedErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    cap_table_id: ct.id,
    project_name: projectName,
    next: {
      // After seeding, walk the founder through the actual on-chain ops.
      // Click "Begin shielding" on the shield page to fire Phase A + Phase B.
      shield_url: `/dashboard/${ct.id}/shield`,
      dashboard_url: `/dashboard/${ct.id}`,
    },
    notes: [
      "Seed wrote 1 cap_table + 12 schedule rows.",
      "2 rows are pre-marked as claimed with mock signatures.",
      "Run the shield flow next to dispatch real UTXOs for the remaining 10 rows.",
      "Generate viewing keys live during the demo for the recording.",
    ],
  });
}
