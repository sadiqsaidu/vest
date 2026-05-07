import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type FinalizeBody = {
  envelope_id: string;
  encrypted_key_payload: { v: 1; iv: string; ct: string };
};

export async function POST(req: Request) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: FinalizeBody;
  try {
    body = (await req.json()) as FinalizeBody;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!body.envelope_id || !body.encrypted_key_payload) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const p = body.encrypted_key_payload;
  if (p.v !== 1 || typeof p.iv !== "string" || typeof p.ct !== "string") {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: row, error: rowErr } = await sb
    .from("viewing_keys")
    .select("id, founder_wallet, status")
    .eq("id", body.envelope_id)
    .single();
  if (rowErr || !row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (row.status !== "pending")
    return NextResponse.json({ error: "Already finalized" }, { status: 409 });

  const { error: updErr } = await sb
    .from("viewing_keys")
    .update({
      envelope: p,
      status: "active",
    })
    .eq("id", body.envelope_id);

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
