import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

  const sig: unknown = body?.shield_tx_signature;
  if (typeof sig !== "string" || sig.length < 16) {
    return NextResponse.json(
      { error: "shield_tx_signature required" },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: ct, error: getErr } = await sb
    .from("cap_tables")
    .select("id, founder_wallet, shield_status")
    .eq("id", params.id)
    .single();

  if (getErr || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: updErr } = await sb
    .from("cap_tables")
    .update({ shield_status: "shielded", shield_tx_signature: sig })
    .eq("id", ct.id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
