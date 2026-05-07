import { NextResponse } from "next/server";
import { readAuthHeaders, verifyWalletSignature } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function authenticate(req: Request): Promise<string | null> {
  const auth = readAuthHeaders(req);
  if (!auth) return null;
  if (!auth.message.startsWith("vest:auth:")) return null;
  const ok = await verifyWalletSignature({
    wallet: auth.wallet,
    message: auth.message,
    signatureBase58: auth.signature,
  });
  return ok ? auth.wallet : null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const wallet = await authenticate(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();

  const { data: ct, error } = await sb
    .from("cap_tables")
    .select(
      "id, founder_wallet, project_name, mint, total, commitment, shield_status, shield_tx_signature, test_mode, created_at",
    )
    .eq("id", params.id)
    .single();

  if (error || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: schedule } = await sb
    .from("unlock_schedule")
    .select(
      "id, beneficiary_wallet, beneficiary_label, unlock_timestamp, amount, status, utxo_commitment, utxo_creation_tx, claim_tx_signature, claimed_at",
    )
    .eq("cap_table_id", ct.id)
    .order("unlock_timestamp", { ascending: true });

  return NextResponse.json({ cap_table: ct, schedule: schedule ?? [] });
}
