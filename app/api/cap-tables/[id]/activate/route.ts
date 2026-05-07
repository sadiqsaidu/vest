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

  const sb = getSupabaseAdmin();
  const { data: ct, error } = await sb
    .from("cap_tables")
    .select("id, founder_wallet, shield_status")
    .eq("id", params.id)
    .single();

  if (error || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ct.shield_status !== "shielded" && ct.shield_status !== "utxos_created")
    return NextResponse.json(
      { error: `Cannot activate from status '${ct.shield_status}'` },
      { status: 400 },
    );

  const { data: rows, error: schedErr } = await sb
    .from("unlock_schedule")
    .select("id, status")
    .eq("cap_table_id", ct.id);

  if (schedErr)
    return NextResponse.json({ error: schedErr.message }, { status: 500 });

  const unfinished =
    rows?.filter((r) => r.status !== "utxo_created" && r.status !== "claimed") ??
    [];
  if (unfinished.length === rows?.length) {
    return NextResponse.json(
      { error: "No UTXOs created yet" },
      { status: 400 },
    );
  }

  const { error: updErr } = await sb
    .from("cap_tables")
    .update({ shield_status: "utxos_created" })
    .eq("id", ct.id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, skipped: unfinished.length });
}
