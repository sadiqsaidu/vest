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
  claim_tx_signature text,              -- on-chain sig of the claim/withdraw tx
  claimed_at timestamptz
);

create index if not exists unlock_schedule_cap_table_idx
  on unlock_schedule(cap_table_id, unlock_timestamp);
create index if not exists unlock_schedule_beneficiary_idx
  on unlock_schedule(beneficiary_wallet);

-- Viewing keys ------------------------------------------------------------
--
-- Each row represents a scoped audit envelope. The actual viewing key bytes
-- are stored encrypted-at-rest under a key derived from `access_token` via
-- HKDF (the access_token never enters the DB). Vest enforces revocation and
-- expiration application-side; the underlying Umbra hierarchical keys
-- themselves cannot be revoked once shared.

create table if not exists viewing_keys (
  id uuid primary key default gen_random_uuid(),
  cap_table_id uuid not null references cap_tables(id) on delete cascade,
  founder_wallet text not null,             -- denormalised; matches cap_tables.founder_wallet
  recipient_label text not null,            -- e.g. "Smith LLP — Tax Year 2025"
  scope text not null check (scope in ('master', 'mint', 'yearly', 'monthly')),
  scope_params jsonb not null default '{}'::jsonb, -- { mint?, year?, month? }
  access_token_hash text not null,          -- sha256(access_token); index target
  envelope jsonb,                           -- { v, iv, ct } AES-GCM payload, set on finalize
  status text not null default 'pending'
    check (status in ('pending', 'active')),
  expires_at timestamptz,                   -- nullable = never (application-level)
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists viewing_keys_access_token_hash_idx
  on viewing_keys(access_token_hash);
create index if not exists viewing_keys_cap_table_idx
  on viewing_keys(cap_table_id);
create index if not exists viewing_keys_founder_idx
  on viewing_keys(founder_wallet);
