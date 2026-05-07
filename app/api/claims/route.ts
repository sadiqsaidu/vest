import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const queryWallet = url.searchParams.get("wallet");
  // Defense in depth: only allow querying your own wallet.
  if (queryWallet && queryWallet !== wallet) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();

  const { data: rows, error } = await sb
    .from("unlock_schedule")
    .select(
      "id, cap_table_id, beneficiary_wallet, beneficiary_label, unlock_timestamp, amount, status, utxo_creation_tx, claim_tx_signature, claimed_at",
    )
    .eq("beneficiary_wallet", wallet)
    .order("unlock_timestamp", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = Array.from(new Set((rows ?? []).map((r) => r.cap_table_id)));
  const captableMap: Record<
    string,
    { id: string; project_name: string; mint: string; founder_wallet: string }
  > = {};

  if (ids.length > 0) {
    const { data: cts, error: ctErr } = await sb
      .from("cap_tables")
      .select("id, project_name, mint, founder_wallet")
      .in("id", ids);
    if (ctErr)
      return NextResponse.json({ error: ctErr.message }, { status: 500 });
    for (const ct of cts ?? []) captableMap[ct.id] = ct;
  }

  const claims = (rows ?? []).map((r) => ({
    id: r.id,
    cap_table_id: r.cap_table_id,
    project_name: captableMap[r.cap_table_id]?.project_name ?? "Direct payment",
    mint: captableMap[r.cap_table_id]?.mint ?? null,
    founder_wallet: captableMap[r.cap_table_id]?.founder_wallet ?? null,
    beneficiary_label: r.beneficiary_label,
    unlock_timestamp: r.unlock_timestamp,
    amount: r.amount,
    status: r.status,
    utxo_creation_tx: r.utxo_creation_tx,
    claim_tx_signature: r.claim_tx_signature,
    claimed_at: r.claimed_at,
  }));

  return NextResponse.json({ claims });
}
