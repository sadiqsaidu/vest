import { NextResponse } from "next/server";
import { readAuthHeaders, verifyWalletSignature } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeCommitment, type ScheduleEntry } from "@/lib/schedule";

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

export async function GET(req: Request) {
  const wallet = await authenticate(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("cap_tables")
    .select("id, project_name, mint, total, shield_status, created_at")
    .eq("founder_wallet", wallet)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cap_tables: data });
}

export async function POST(req: Request) {
  const wallet = await authenticate(req);
  if (!wallet)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_name, mint, total, schedule, test_mode } = body ?? {};
  if (
    typeof project_name !== "string" ||
    !project_name.trim() ||
    typeof mint !== "string" ||
    typeof total !== "string" ||
    !Array.isArray(schedule)
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const entries = schedule as ScheduleEntry[];
  const commitment = computeCommitment({
    project_name,
    mint,
    schedule: entries,
  });

  const sb = getSupabaseAdmin();

  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .insert({
      founder_wallet: wallet,
      project_name,
      mint,
      total,
      commitment,
      shield_status: "pending",
      test_mode: !!test_mode,
    })
    .select("id")
    .single();

  if (ctErr || !ct)
    return NextResponse.json(
      { error: ctErr?.message ?? "Insert failed" },
      { status: 500 },
    );

  const rows = entries.map((s) => ({
    cap_table_id: ct.id,
    beneficiary_wallet: s.beneficiary_wallet,
    beneficiary_label: s.beneficiary_label,
    unlock_timestamp: s.unlock_timestamp,
    amount: s.amount,
    status: "scheduled",
  }));

  if (rows.length > 0) {
    const { error: schedErr } = await sb.from("unlock_schedule").insert(rows);
    if (schedErr) {
      return NextResponse.json({ error: schedErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: ct.id });
}
