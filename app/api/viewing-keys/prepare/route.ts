import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/wallet-sig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateAccessToken } from "@/lib/viewingKeys/envelope";
import { hashAccessToken } from "@/lib/viewingKeys/server";

export const runtime = "nodejs";

type PrepareBody = {
  cap_table_id: string;
  scope: "master" | "mint" | "yearly" | "monthly";
  scope_params?: { mint?: string; year?: number; month?: number };
  recipient_label: string;
  expires_at?: string | null;
};

export async function POST(req: Request) {
  const wallet = await verifyRequest(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PrepareBody;
  try {
    body = (await req.json()) as PrepareBody;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!body.cap_table_id || !body.scope || !body.recipient_label?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!["master", "mint", "yearly", "monthly"].includes(body.scope)) {
    return NextResponse.json({ error: "Bad scope" }, { status: 400 });
  }
  const params = body.scope_params ?? {};
  if (body.scope === "mint" && !params.mint) {
    return NextResponse.json({ error: "Mint required" }, { status: 400 });
  }
  if (body.scope === "yearly" && (!params.mint || !params.year)) {
    return NextResponse.json(
      { error: "Mint and year required" },
      { status: 400 },
    );
  }
  if (
    body.scope === "monthly" &&
    (!params.mint || !params.year || !params.month)
  ) {
    return NextResponse.json(
      { error: "Mint, year, and month required" },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .select("id, founder_wallet")
    .eq("id", body.cap_table_id)
    .single();
  if (ctErr || !ct)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ct.founder_wallet !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accessToken = generateAccessToken();
  const accessTokenHash = await hashAccessToken(accessToken);

  const { data: row, error: insErr } = await sb
    .from("viewing_keys")
    .insert({
      cap_table_id: ct.id,
      founder_wallet: wallet,
      recipient_label: body.recipient_label.trim().slice(0, 200),
      scope: body.scope,
      scope_params: params,
      access_token_hash: accessTokenHash,
      status: "pending",
      expires_at: body.expires_at ?? null,
    })
    .select("id")
    .single();

  if (insErr || !row)
    return NextResponse.json(
      { error: insErr?.message ?? "Insert failed" },
      { status: 500 },
    );

  return NextResponse.json({
    envelope_id: row.id,
    access_token: accessToken,
  });
}
