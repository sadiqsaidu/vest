-- Vest Supabase schema (reference)
-- Apply via Supabase SQL editor or `supabase db push`.

create table if not exists cap_tables (
  id uuid primary key default gen_random_uuid(),
  founder_wallet text not null,
  project_name text not null,
  mint text not null,
  total text not null,                  -- base units, stored as text for bigint safety
  commitment text not null,             -- base64(sha256(canonical schedule))
  shield_status text not null default 'pending'
    check (shield_status in (
      'pending', 'shielded', 'utxos_created', 'partially_claimed', 'fully_claimed'
    )),
  shield_tx_signature text,             -- queueSignature from Phase A deposit
  test_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists cap_tables_founder_idx on cap_tables(founder_wallet);

create table if not exists unlock_schedule (
  id uuid primary key default gen_random_uuid(),
  cap_table_id uuid not null references cap_tables(id) on delete cascade,
  beneficiary_wallet text not null,
  beneficiary_label text not null,
  unlock_timestamp bigint not null,     -- unix seconds
  amount text not null,                 -- base units
  status text not null default 'scheduled'
    check (status in ('scheduled', 'utxo_created', 'claimed')),
  utxo_commitment text,                 -- Poseidon commitment from creation result
  utxo_creation_tx text,                -- primary tx signature for the UTXO creation
  utxo_signature text,                  -- legacy alias; kept for compatibility
  claimed_at timestamptz
);

create index if not exists unlock_schedule_cap_table_idx
  on unlock_schedule(cap_table_id, unlock_timestamp);
create index if not exists unlock_schedule_beneficiary_idx
  on unlock_schedule(beneficiary_wallet);
