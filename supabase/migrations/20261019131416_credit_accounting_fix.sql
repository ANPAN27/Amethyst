-- Correct the available-balance reported on reservation commits and make the
-- idempotent grant path return the existing transaction instead of NULL when
-- the conflict is resolved without raising.

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

  if v_existing.id is null then
    select * into v_existing
    from public.credit_transactions
    where idempotency_key = p_idempotency_key;
  end if;

  if v_existing.id is null then
    raise exception 'credit_grant_failed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'transaction_id', v_existing.id,
    'balance_after', v_existing.balance_after,
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

  select available into v_available
  from public.credit_accounts
  where user_id = v_res.user_id
  for update;

  if not found then
    raise exception 'credit_account_not_found' using errcode = 'P0001';
  end if;

  if v_available is null then
    raise exception 'credit_account_not_found' using errcode = 'P0001';
  end if;

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
    v_available,
    'reservation:' || p_reservation_id::text,
    v_res.reference_type,
    v_res.reference_id,
    jsonb_build_object('reservation_id', p_reservation_id)
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('status', 'committed', 'idempotent', false);
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, integer, text, text, text, jsonb)
  to service_role;
grant execute on function public.commit_reservation(uuid)
  to service_role;
