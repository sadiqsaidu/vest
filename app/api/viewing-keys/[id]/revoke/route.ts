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
  const { data: row, error: rowErr } = await sb
    .from("viewing_keys")
    .select("id, founder_wallet, revoked_at")
    .eq("id", params.id)
    .single();
  if (rowErr || !row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (row.revoked_at)
    return NextResponse.json({ ok: true, already_revoked: true });

  const { error: updErr } = await sb
    .from("viewing_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
