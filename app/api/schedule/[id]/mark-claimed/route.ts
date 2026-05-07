import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sig: unknown = body?.claim_tx_signature;
  if (typeof sig !== "string" || sig.length < 8) {
    return NextResponse.json(
      { error: "claim_tx_signature required" },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from("unlock_schedule")
    .select("id, status, beneficiary_wallet")
    .eq("id", params.id)
    .single();

  if (error || !row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.beneficiary_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (row.status !== "utxo_created") {
    return NextResponse.json(
      { error: `Cannot mark-claimed from status '${row.status}'` },
      { status: 400 },
    );
  }

  const { error: updErr } = await sb
    .from("unlock_schedule")
    .update({
      status: "claimed",
      claim_tx_signature: sig,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
