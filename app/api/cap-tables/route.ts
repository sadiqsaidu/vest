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

  const projectName =
    typeof body?.project_name === "string" ? body.project_name.trim() : "";
  const mint = typeof body?.mint === "string" ? body.mint.trim() : "";
  const total = typeof body?.total === "string" ? body.total.trim() : "";
  const test_mode = !!body?.test_mode;
  const schedule = body?.schedule;

  if (!projectName || !mint || !total || !Array.isArray(schedule)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const entries: ScheduleEntry[] = [];
  for (const raw of schedule) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: "Schedule contains a malformed entry" },
        { status: 400 },
      );
    }
    const beneficiary_wallet =
      typeof raw.beneficiary_wallet === "string"
        ? raw.beneficiary_wallet.trim()
        : "";
    const beneficiary_label =
      typeof raw.beneficiary_label === "string"
        ? raw.beneficiary_label.trim()
        : "";
    const unlock_timestamp = Number(raw.unlock_timestamp);
    const amount = typeof raw.amount === "string" ? raw.amount.trim() : "";
    if (
      !beneficiary_wallet ||
      !beneficiary_label ||
      !Number.isFinite(unlock_timestamp) ||
      !amount ||
      !/^\d+$/.test(amount)
    ) {
      return NextResponse.json(
        {
          error:
            "Schedule entry missing required fields (wallet/label/timestamp/amount).",
        },
        { status: 400 },
      );
    }
    entries.push({
      beneficiary_wallet,
      beneficiary_label,
      unlock_timestamp,
      amount,
    });
  }

  const commitment = computeCommitment({
    project_name: projectName,
    mint,
    schedule: entries,
  });

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Supabase admin not configured" },
      { status: 500 },
    );
  }

  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .insert({
      founder_wallet: wallet,
      project_name: projectName,
      mint,
      total,
      commitment,
      shield_status: "pending",
      test_mode,
    })
    .select("id")
    .single();

  if (ctErr || !ct) {
    return NextResponse.json(
      {
        error: ctErr?.message ?? "Insert failed",
        // Surface PostgREST diagnostic fields so we can tell apart
        // "missing table" vs "RLS denied" vs "service URL misconfigured".
        code: (ctErr as any)?.code,
        details: (ctErr as any)?.details,
        hint: (ctErr as any)?.hint,
      },
      { status: 500 },
    );
  }

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
      return NextResponse.json(
        {
          error: schedErr.message,
          code: (schedErr as any)?.code,
          details: (schedErr as any)?.details,
          hint: (schedErr as any)?.hint,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ id: ct.id });
}
