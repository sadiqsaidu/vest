import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const capTableId = url.searchParams.get("cap_table_id");
  if (!capTableId)
    return NextResponse.json({ error: "cap_table_id required" }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .select("id, founder_wallet")
    .eq("id", capTableId)
    .single();
  if (ctErr || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows, error: listErr } = await sb
    .from("viewing_keys")
    .select(
      "id, recipient_label, scope, scope_params, status, expires_at, revoked_at, last_accessed_at, created_at",
    )
    .eq("cap_table_id", ct.id)
    .order("created_at", { ascending: false });

  if (listErr)
    return NextResponse.json({ error: listErr.message }, { status: 500 });

  return NextResponse.json({ keys: rows ?? [] });
}
