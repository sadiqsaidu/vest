import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type ActivityEvent = {
  kind:
    | "treasury_shielded"
    | "utxo_created"
    | "utxo_claimed"
    | "viewing_key_issued"
    | "viewing_key_revoked";
  at: string; // ISO
  signature?: string | null;
  // Per-kind payload, kept loose so the UI can render uniformly.
  data: Record<string, any>;
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .select(
      "id, founder_wallet, project_name, mint, shield_status, shield_tx_signature, total, created_at",
    )
    .eq("id", params.id)
    .single();

  if (ctErr || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows, error: rowErr } = await sb
    .from("unlock_schedule")
    .select(
      "id, beneficiary_label, beneficiary_wallet, amount, unlock_timestamp, status, utxo_creation_tx, claim_tx_signature, claimed_at",
    )
    .eq("cap_table_id", ct.id);

  if (rowErr)
    return NextResponse.json({ error: rowErr.message }, { status: 500 });

  const events: ActivityEvent[] = [];

  if (ct.shield_tx_signature) {
    events.push({
      kind: "treasury_shielded",
      at: ct.created_at,
      signature: ct.shield_tx_signature,
      data: { amount: ct.total, mint: ct.mint },
    });
  }

  for (const r of rows ?? []) {
    if (r.utxo_creation_tx) {
      // We don't have a per-row creation timestamp; fall back to the cap_table
      // created_at + unlock_timestamp ordering. Acceptable for the demo —
      // events are displayed reverse-chronologically by `at`.
      events.push({
        kind: "utxo_created",
        at: ct.created_at,
        signature: r.utxo_creation_tx,
        data: {
          schedule_id: r.id,
          beneficiary_label: r.beneficiary_label,
          amount: r.amount,
          mint: ct.mint,
        },
      });
    }
    if (r.claimed_at && r.claim_tx_signature) {
      events.push({
        kind: "utxo_claimed",
        at: r.claimed_at,
        signature: r.claim_tx_signature,
        data: {
          schedule_id: r.id,
          beneficiary_label: r.beneficiary_label,
          beneficiary_wallet: r.beneficiary_wallet,
          amount: r.amount,
          mint: ct.mint,
        },
      });
    }
  }

  // Reverse chronological. Stable secondary sort by kind so co-timestamped
  // UTXO-created events land in a deterministic order.
  events.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (ta !== tb) return tb - ta;
    return a.kind.localeCompare(b.kind);
  });

  return NextResponse.json({ events });
}
