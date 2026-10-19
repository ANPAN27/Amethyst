-- Atomic companion pairing exchange. The pairing code is consumed and the
-- companion plus its token digest are created in one transaction.

create or replace function public.exchange_pairing_code(
  p_code_hash text,
  p_token_hash text,
  p_token_prefix text,
  p_name text,
  p_platform text,
  p_version text,
  p_capabilities text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.pairing_codes;
  v_companion public.companions;
begin
  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 120 then
    raise exception 'invalid_companion_name' using errcode = 'P0001';
  end if;

  update public.pairing_codes
  set consumed_at = now()
  where code_hash = p_code_hash
    and consumed_at is null
    and expires_at > now()
  returning * into v_code;

  if not found then
    raise exception 'invalid_pairing_code' using errcode = 'P0001';
  end if;

  insert into public.companions (owner_id, name, platform, version, capabilities)
  values (
    v_code.owner_id,
    p_name,
    nullif(p_platform, ''),
    nullif(p_version, ''),
    coalesce(p_capabilities, '{}'::text[])
  )
  returning * into v_companion;

  insert into public.companion_credentials (companion_id, token_hash, token_prefix)
  values (v_companion.id, p_token_hash, p_token_prefix);

  return jsonb_build_object(
    'companion_id', v_companion.id,
    'owner_id', v_companion.owner_id,
    'name', v_companion.name,
    'status', v_companion.status
  );
end;
$$;

revoke all on function public.exchange_pairing_code(text, text, text, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.exchange_pairing_code(text, text, text, text, text, text, text[])
  to service_role;
