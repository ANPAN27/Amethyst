-- Amethyst initial schema.
-- Authoritative application data lives in Postgres. TigerGraph holds only graph
-- relationships and is treated as a derived, rebuildable index.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.analysis_workflow as enum (
  'analyze_javascript_application',
  'inspect_managed_artifact',
  'inspect_sqlite_database',
  'inspect_go_binary',
  'inspect_rust_binary'
);

create type public.job_status as enum (
  'queued',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'canceled'
);

create type public.finding_class as enum (
  'observed',
  'verified_relationship',
  'inferred',
  'ai_interpretation',
  'proposed_code'
);

create type public.graph_sync_status as enum ('pending', 'succeeded', 'failed', 'skipped');

create type public.credit_txn_kind as enum ('grant', 'purchase', 'debit', 'refund', 'adjustment');

create type public.reservation_status as enum ('reserved', 'committed', 'released');

create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type public.webhook_status as enum ('received', 'processed', 'failed');

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects and analysis targets
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_created_idx on public.projects (owner_id, created_at desc);

alter table public.projects enable row level security;

create policy "projects_select_own"
  on public.projects for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.analysis_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  label text not null check (char_length(label) between 1 and 200),
  -- Local absolute path on the paired machine. Never sent to a model provider.
  target_path text not null check (char_length(target_path) between 1 and 4096),
  target_digest text check (char_length(target_digest) <= 128),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analysis_targets_project_idx on public.analysis_targets (project_id, created_at desc);

alter table public.analysis_targets enable row level security;

create policy "analysis_targets_select_own"
  on public.analysis_targets for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = analysis_targets.project_id
        and p.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Companions and pairing
-- ---------------------------------------------------------------------------

create table public.companions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text check (char_length(platform) <= 120),
  version text check (char_length(version) <= 60),
  capabilities text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index companions_owner_idx on public.companions (owner_id, created_at desc);

alter table public.companions enable row level security;

create policy "companions_select_own"
  on public.companions for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Bearer token digests are isolated from the owner-readable companions table.
create table public.companion_credentials (
  companion_id uuid primary key references public.companions (id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.companion_credentials enable row level security;

-- Codes are short-lived, single-use and only read by the server.
create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  companion_name text check (char_length(companion_name) <= 120),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index pairing_codes_expires_idx on public.pairing_codes (expires_at);

alter table public.pairing_codes enable row level security;

-- ---------------------------------------------------------------------------
-- Analysis jobs, artifacts and findings
-- ---------------------------------------------------------------------------

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  companion_id uuid references public.companions (id) on delete set null,
  target_id uuid references public.analysis_targets (id) on delete set null,
  workflow public.analysis_workflow not null,
  params jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  error_code text check (char_length(error_code) <= 80),
  error_message text check (char_length(error_message) <= 2000),
  result_summary jsonb,
  idempotency_key text check (char_length(idempotency_key) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  lease_expires_at timestamptz
);

create unique index analysis_jobs_idempotency_idx
  on public.analysis_jobs (owner_id, idempotency_key)
  where idempotency_key is not null;
create index analysis_jobs_owner_created_idx
  on public.analysis_jobs (owner_id, created_at desc);
create index analysis_jobs_project_created_idx
  on public.analysis_jobs (project_id, created_at desc);
create index analysis_jobs_claim_idx
  on public.analysis_jobs (companion_id, status, created_at)
  where status in ('queued', 'claimed', 'running');

alter table public.analysis_jobs enable row level security;

create policy "analysis_jobs_select_own"
  on public.analysis_jobs for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create table public.analysis_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.analysis_jobs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 1024),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 0 and 52428800),
  content_type text not null default 'application/json',
  created_at timestamptz not null default now()
);

create unique index analysis_artifacts_path_idx on public.analysis_artifacts (storage_path);
create index analysis_artifacts_job_idx on public.analysis_artifacts (job_id);

alter table public.analysis_artifacts enable row level security;

create policy "analysis_artifacts_select_own"
  on public.analysis_artifacts for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.analysis_jobs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  class public.finding_class not null,
  category text check (char_length(category) <= 80),
  title text not null check (char_length(title) between 1 and 500),
  detail text check (char_length(detail) <= 20000),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index findings_job_idx on public.findings (job_id, created_at);
create index findings_project_idx on public.findings (project_id, created_at desc);

alter table public.findings enable row level security;

create policy "findings_select_own"
  on public.findings for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create table public.graph_sync (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.analysis_jobs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status public.graph_sync_status not null default 'pending',
  vertices_upserted integer not null default 0,
  edges_upserted integer not null default 0,
  error_message text check (char_length(error_message) <= 2000),
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index graph_sync_project_idx on public.graph_sync (project_id, created_at desc);

alter table public.graph_sync enable row level security;

create policy "graph_sync_select_own"
  on public.graph_sync for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- AI audit trail
-- ---------------------------------------------------------------------------

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'codegen')),
  model text not null check (char_length(model) <= 120),
  question text not null check (char_length(question) <= 8000),
  answer text,
  grounding text not null default 'insufficient'
    check (grounding in ('evidence', 'partial', 'insufficient')),
  evidence_refs jsonb not null default '[]'::jsonb,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  reservation_id uuid,
  created_at timestamptz not null default now()
);

create index ai_runs_project_idx on public.ai_runs (project_id, created_at desc);

alter table public.ai_runs enable row level security;

create policy "ai_runs_select_own"
  on public.ai_runs for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Credits (authoritative, append-only ledger)
-- ---------------------------------------------------------------------------

create table public.credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  available integer not null default 0 check (available >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now()
);

alter table public.credit_accounts enable row level security;

create policy "credit_accounts_select_own"
  on public.credit_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.credit_txn_kind not null,
  amount integer not null check (amount > 0),
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  reference_type text check (char_length(reference_type) <= 80),
  reference_id text check (char_length(reference_id) <= 200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_transactions_user_idx
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

create policy "credit_transactions_select_own"
  on public.credit_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  status public.reservation_status not null default 'reserved',
  reference_type text check (char_length(reference_type) <= 80),
  reference_id text check (char_length(reference_id) <= 200),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index credit_reservations_user_idx
  on public.credit_reservations (user_id, created_at desc);

alter table public.credit_reservations enable row level security;

create policy "credit_reservations_select_own"
  on public.credit_reservations for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'dodo',
  provider_session_id text unique,
  product_id text not null,
  credits integer not null check (credits > 0),
  status text not null default 'created'
    check (status in ('created', 'completed', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checkout_sessions_user_idx on public.checkout_sessions (user_id, created_at desc);

alter table public.checkout_sessions enable row level security;

create policy "checkout_sessions_select_own"
  on public.checkout_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger checkout_sessions_set_updated_at
  before update on public.checkout_sessions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'dodo',
  provider_payment_id text unique,
  checkout_session_id text,
  product_id text,
  credits integer check (credits >= 0),
  amount integer check (amount >= 0),
  currency text check (char_length(currency) <= 8),
  status public.payment_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

create policy "payments_select_own"
  on public.payments for select
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Webhook IDs are deduplication keys, not client data.
create table public.webhook_events (
  id text primary key check (char_length(id) <= 200),
  provider text not null default 'dodo',
  event_type text,
  status public.webhook_status not null default 'received',
  attempts integer not null default 0,
  payload_sha256 text check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  last_error text check (char_length(last_error) <= 2000),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.webhook_events enable row level security;

-- Internal rate limiting table (used by SECURITY DEFINER function only).
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Auth bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.credit_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill accounts for users created before this migration.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

insert into public.credit_accounts (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Credit functions (atomic; service role only)
-- ---------------------------------------------------------------------------

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available integer;
  v_existing public.credit_transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) = 0 then
    raise exception 'missing_idempotency_key' using errcode = 'P0001';
  end if;

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select available into v_available
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  -- Re-check under the account lock so concurrent duplicate grants are safe.
  select * into v_existing
  from public.credit_transactions
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'balance_after', v_existing.balance_after,
      'idempotent', true
    );
  end if;

  update public.credit_accounts
  set available = available + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, kind, amount, delta, balance_after, idempotency_key,
    reference_type, reference_id, metadata
  )
  values (
    p_user_id,
    case when p_reference_type in ('purchase', 'checkout', 'payment') then 'purchase'::public.credit_txn_kind
         else 'grant'::public.credit_txn_kind end,
    p_amount,
    p_amount,
    v_available + p_amount,
    p_idempotency_key,
    p_reference_type,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning * into v_existing;

  return jsonb_build_object(
    'transaction_id', v_existing.id,
    'balance_after', v_existing.balance_after,
    'idempotent', false
  );
exception
  when unique_violation then
    select * into v_existing from public.credit_transactions where idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'balance_after', v_existing.balance_after,
      'idempotent', true
    );
end;
$$;

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reference_type text default null,
  p_reference_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available integer;
  v_reserved integer;
  v_existing public.credit_reservations;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) = 0 then
    raise exception 'missing_idempotency_key' using errcode = 'P0001';
  end if;

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select available, reserved into v_available, v_reserved
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  -- Re-check under the account lock so concurrent duplicate reservations are safe.
  select * into v_existing
  from public.credit_reservations
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'idempotent', true
    );
  end if;

  if v_available < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.credit_accounts
  set available = available - p_amount,
      reserved = reserved + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_reservations (
    user_id, amount, status, reference_type, reference_id, idempotency_key
  )
  values (p_user_id, p_amount, 'reserved', p_reference_type, p_reference_id, p_idempotency_key)
  returning * into v_existing;

  return jsonb_build_object(
    'reservation_id', v_existing.id,
    'status', v_existing.status,
    'idempotent', false
  );
end;
$$;

create or replace function public.commit_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.credit_reservations;
  v_available integer;
  v_reserved integer;
begin
  select * into v_res
  from public.credit_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;

  if v_res.status = 'committed' then
    return jsonb_build_object('status', 'committed', 'idempotent', true);
  end if;

  if v_res.status = 'released' then
    raise exception 'reservation_already_released' using errcode = 'P0001';
  end if;

  select available, reserved into v_available, v_reserved
  from public.credit_accounts
  where user_id = v_res.user_id
  for update;

  update public.credit_accounts
  set reserved = reserved - v_res.amount,
      updated_at = now()
  where user_id = v_res.user_id;

  update public.credit_reservations
  set status = 'committed', settled_at = now()
  where id = p_reservation_id;

  insert into public.credit_transactions (
    user_id, kind, amount, delta, balance_after, idempotency_key,
    reference_type, reference_id, metadata
  )
  values (
    v_res.user_id,
    'debit',
    v_res.amount,
    -v_res.amount,
    v_available + v_reserved - v_res.amount,
    'reservation:' || p_reservation_id::text,
    v_res.reference_type,
    v_res.reference_id,
    jsonb_build_object('reservation_id', p_reservation_id)
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('status', 'committed', 'idempotent', false);
end;
$$;

create or replace function public.release_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.credit_reservations;
begin
  select * into v_res
  from public.credit_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;

  if v_res.status = 'released' then
    return jsonb_build_object('status', 'released', 'idempotent', true);
  end if;

  if v_res.status = 'committed' then
    raise exception 'reservation_already_committed' using errcode = 'P0001';
  end if;

  update public.credit_accounts
  set available = available + v_res.amount,
      reserved = reserved - v_res.amount,
      updated_at = now()
  where user_id = v_res.user_id;

  update public.credit_reservations
  set status = 'released', settled_at = now()
  where id = p_reservation_id;

  return jsonb_build_object('status', 'released', 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup; bounded and cheap.
  delete from public.rate_limits
  where window_start < now() - interval '1 day'
    and random() < 0.01;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Companion job claiming
-- ---------------------------------------------------------------------------

create or replace function public.claim_next_job(
  p_companion_id uuid,
  p_owner_id uuid
)
returns setof public.analysis_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Requeue expired leases belonging to this companion only.
  update public.analysis_jobs
  set status = 'queued',
      lease_expires_at = null
  where companion_id = p_companion_id
    and owner_id = p_owner_id
    and status in ('claimed', 'running')
    and lease_expires_at is not null
    and lease_expires_at < now();

  select id into v_id
  from public.analysis_jobs
  where companion_id = p_companion_id
    and owner_id = p_owner_id
    and status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  update public.analysis_jobs
  set status = 'claimed',
      claimed_at = now(),
      lease_expires_at = now() + interval '30 minutes'
  where id = v_id;

  return query select * from public.analysis_jobs where id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic job finalization
-- ---------------------------------------------------------------------------

create or replace function public.finalize_job(
  p_job_id uuid,
  p_owner_id uuid,
  p_companion_id uuid,
  p_status text,
  p_error_code text,
  p_error_message text,
  p_summary jsonb,
  p_findings jsonb,
  p_artifact_path text,
  p_artifact_sha256 text,
  p_artifact_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.analysis_jobs;
  v_count integer := 0;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_job_status' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.analysis_jobs
  where id = p_job_id
    and owner_id = p_owner_id
    and companion_id = p_companion_id
  for update;

  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;

  if v_job.status not in ('claimed', 'running') then
    raise exception 'job_not_open' using errcode = 'P0001';
  end if;

  if p_artifact_path is not null then
    insert into public.analysis_artifacts (
      job_id, project_id, owner_id, storage_path, sha256, size_bytes
    )
    values (
      v_job.id, v_job.project_id, v_job.owner_id,
      p_artifact_path, p_artifact_sha256, p_artifact_size
    )
    on conflict (storage_path) do nothing;
  end if;

  update public.analysis_jobs
  set status = p_status::public.job_status,
      progress = case when p_status = 'succeeded' then 100 else progress end,
      error_code = p_error_code,
      error_message = p_error_message,
      result_summary = p_summary,
      finished_at = now(),
      lease_expires_at = null
  where id = p_job_id;

  if p_status = 'succeeded' and p_findings is not null then
    insert into public.findings (
      job_id, project_id, owner_id, class, category, title, detail, confidence, evidence
    )
    select
      v_job.id,
      v_job.project_id,
      v_job.owner_id,
      coalesce((f ->> 'class')::public.finding_class, 'observed'::public.finding_class),
      f ->> 'category',
      f ->> 'title',
      f ->> 'detail',
      (f ->> 'confidence')::numeric,
      coalesce(f -> 'evidence', '[]'::jsonb)
    from jsonb_array_elements(p_findings) as f
    where f ->> 'title' is not null;

    get diagnostics v_count = row_count;

    insert into public.graph_sync (job_id, project_id, owner_id, status)
    values (v_job.id, v_job.project_id, v_job.owner_id, 'pending')
    on conflict (job_id) do nothing;
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', p_status,
    'findings_inserted', v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Authenticated users can read their rows (RLS applies) but never write app
-- data directly. All writes go through audited server routes or service role.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

revoke all on table public.webhook_events from anon, authenticated;
revoke all on table public.pairing_codes from anon, authenticated;
revoke all on table public.companion_credentials from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;

grant select on table
  public.profiles,
  public.projects,
  public.analysis_targets,
  public.companions,
  public.analysis_jobs,
  public.analysis_artifacts,
  public.findings,
  public.graph_sync,
  public.ai_runs,
  public.credit_accounts,
  public.credit_transactions,
  public.credit_reservations,
  public.checkout_sessions,
  public.payments
to authenticated;

grant all on all tables in schema public to service_role;

revoke all on function public.grant_credits(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.commit_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_reservation(uuid) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_next_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_job(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, bigint) from public, anon, authenticated;

grant execute on function public.grant_credits(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.reserve_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.commit_reservation(uuid) to service_role;
grant execute on function public.release_reservation(uuid) to service_role;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.claim_next_job(uuid, uuid) to service_role;
grant execute on function public.finalize_job(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Private artifact storage (service-role signed URLs only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'analysis-artifacts',
  'analysis-artifacts',
  false,
  52428800,
  array['application/json']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
