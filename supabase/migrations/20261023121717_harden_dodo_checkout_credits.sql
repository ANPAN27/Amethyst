-- Store the server-verified Dodo product price at checkout creation so the
-- webhook can reject currency or amount mismatches without trusting client data.

alter table public.checkout_sessions
  add column if not exists expected_amount integer
    check (expected_amount is null or expected_amount > 0),
  add column if not exists expected_currency text
    check (expected_currency is null or expected_currency ~ '^[A-Z]{3}$');

-- Serialize grants by idempotency key as well as by account. The ledger row is
-- inserted before the balance is incremented, so a conflict can never leave an
-- incremented balance without a matching transaction.
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

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select available into v_available
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  select * into v_existing
  from public.credit_transactions
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.user_id <> p_user_id then
      raise exception 'idempotency_key_user_mismatch' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'balance_after', v_existing.balance_after,
      'idempotent', true
    );
  end if;

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
  returning * into v_existing;

  update public.credit_accounts
  set available = available + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'transaction_id', v_existing.id,
    'balance_after', v_existing.balance_after,
    'idempotent', false
  );
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, integer, text, text, text, jsonb)
  to service_role;
