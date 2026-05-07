import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashAccessToken } from "@/lib/viewingKeys/server";
import { isAccessToken } from "@/lib/viewingKeys/envelope";
import {
  rowInScope,
  eventInScope,
  type ScopeKind,
  type ScopeParams,
} from "@/lib/viewingKeys/scope";

export const runtime = "nodejs";

type DecryptBody = { access_token: string };

export async function POST(req: Request) {
  let body: DecryptBody;
  try {
    body = (await req.json()) as DecryptBody;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!body.access_token || !isAccessToken(body.access_token)) {
    return NextResponse.json(
      { error: "Invalid access token" },
      { status: 400 },
    );
  }

  const accessTokenHash = await hashAccessToken(body.access_token);
  const sb = getSupabaseAdmin();

  const { data: vk, error: vkErr } = await sb
    .from("viewing_keys")
    .select(
      "id, cap_table_id, founder_wallet, recipient_label, scope, scope_params, envelope, status, expires_at, revoked_at, created_at",
    )
    .eq("access_token_hash", accessTokenHash)
    .single();

  if (vkErr || !vk)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (vk.status !== "active" || !vk.envelope)
    return NextResponse.json(
      { error: "Envelope not finalised" },
      { status: 409 },
    );
  if (vk.revoked_at)
    return NextResponse.json(
      { error: "This viewing key has been revoked." },
      { status: 410 },
    );
  if (vk.expires_at && new Date(vk.expires_at).getTime() < Date.now())
    return NextResponse.json(
      { error: "This viewing key has expired." },
      { status: 410 },
    );

  const { data: ct, error: ctErr } = await sb
    .from("cap_tables")
    .select(
      "id, founder_wallet, project_name, mint, total, commitment, shield_status, shield_tx_signature, test_mode, created_at",
    )
    .eq("id", vk.cap_table_id)
    .single();
  if (ctErr || !ct)
    return NextResponse.json({ error: "Cap table missing" }, { status: 404 });

  const { data: schedule } = await sb
    .from("unlock_schedule")
    .select(
      "id, beneficiary_wallet, beneficiary_label, unlock_timestamp, amount, status, utxo_commitment, utxo_creation_tx, claim_tx_signature, claimed_at",
    )
    .eq("cap_table_id", ct.id)
    .order("unlock_timestamp", { ascending: true });

  const scope = vk.scope as ScopeKind;
  const params = (vk.scope_params ?? {}) as ScopeParams;
  const ctCreatedSec = Math.floor(new Date(ct.created_at).getTime() / 1000);

  const filteredSchedule = (schedule ?? []).filter((r) =>
    rowInScope(scope, params, ct.mint, r, ctCreatedSec),
  );

  // Activity events derived inline (mirrors /api/cap-tables/[id]/activity).
  type Ev = {
    kind:
      | "treasury_shielded"
      | "utxo_created"
      | "utxo_claimed"
      | "viewing_key_issued"
      | "viewing_key_revoked";
    at: string;
    signature?: string | null;
    data: Record<string, any>;
  };
  const events: Ev[] = [];
  if (ct.shield_tx_signature) {
    events.push({
      kind: "treasury_shielded",
      at: ct.created_at,
      signature: ct.shield_tx_signature,
      data: { amount: ct.total, mint: ct.mint },
    });
  }
  for (const r of schedule ?? []) {
    if (r.utxo_creation_tx) {
      events.push({
        kind: "utxo_created",
        at: ct.created_at,
        signature: r.utxo_creation_tx,
        data: {
          schedule_id: r.id,
          beneficiary_label: r.beneficiary_label,
          amount: r.amount,
          mint: ct.mint,
        },
      });
    }
    if (r.claimed_at && r.claim_tx_signature) {
      events.push({
        kind: "utxo_claimed",
        at: r.claimed_at,
        signature: r.claim_tx_signature,
        data: {
          schedule_id: r.id,
          beneficiary_label: r.beneficiary_label,
          beneficiary_wallet: r.beneficiary_wallet,
          amount: r.amount,
          mint: ct.mint,
        },
      });
    }
  }
  const filteredEvents = events
    .filter((e) => eventInScope(scope, params, ct.mint, e))
    .sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (ta !== tb) return tb - ta;
      return a.kind.localeCompare(b.kind);
    });

  // Stamp last_accessed_at — best effort, ignore failures.
  await sb
    .from("viewing_keys")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", vk.id);

  return NextResponse.json({
    envelope_id: vk.id,
    encrypted_key_payload: vk.envelope,
    scope,
    scope_params: params,
    recipient_label: vk.recipient_label,
    expires_at: vk.expires_at,
    issued_at: vk.created_at,
    cap_table: {
      id: ct.id,
      project_name: ct.project_name,
      mint: ct.mint,
      total: ct.total,
      commitment: ct.commitment,
      shield_status: ct.shield_status,
      shield_tx_signature: ct.shield_tx_signature,
      founder_wallet: ct.founder_wallet,
      created_at: ct.created_at,
      test_mode: ct.test_mode,
    },
    schedule: filteredSchedule,
    events: filteredEvents,
  });
}
