import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  scheduled: ["utxo_created"],
  utxo_created: ["claimed"],
};

export async function PATCH(
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

  const utxo_commitment: unknown = body?.utxo_commitment;
  const utxo_creation_tx: unknown = body?.utxo_creation_tx;
  const status: unknown = body?.status;
  if (
    typeof utxo_commitment !== "string" ||
    typeof utxo_creation_tx !== "string" ||
    typeof status !== "string"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: row, error: getErr } = await sb
    .from("unlock_schedule")
    .select("id, status, cap_table_id")
    .eq("id", params.id)
    .single();

  if (getErr || !row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = ALLOWED_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Invalid transition '${row.status}' → '${status}'` },
      { status: 400 },
    );
  }

  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .select("founder_wallet")
    .eq("id", row.cap_table_id)
    .single();

  if (ctErr || !ct)
    return NextResponse.json({ error: "Cap table not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: updErr } = await sb
    .from("unlock_schedule")
    .update({
      utxo_commitment,
      utxo_creation_tx,
      utxo_signature: utxo_creation_tx,
      status,
    })
    .eq("id", row.id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
