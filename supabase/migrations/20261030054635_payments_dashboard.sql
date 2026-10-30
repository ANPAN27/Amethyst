-- Dedicated payments dashboard support.
--
-- Existing tables already model the logical payment_orders / payment_webhook_events
-- entities:
--   checkout_sessions -> payment_orders (server-created order + expected price)
--   payments          -> verified provider payment records
--   webhook_events    -> payment_webhook_events (webhook-id deduplication)
-- This migration extends the payment status enum and adds an aggregate helper
-- used by the authenticated payments overview.

alter type public.payment_status add value if not exists 'processing';
alter type public.payment_status add value if not exists 'cancelled';

create or replace function public.credit_totals(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'purchased', coalesce(sum(case when delta > 0 then delta else 0 end), 0),
    'consumed', coalesce(sum(case when delta < 0 then -delta else 0 end), 0),
    'entries', count(*)
  )
  from public.credit_transactions
  where user_id = p_user_id;
$$;

revoke all on function public.credit_totals(uuid) from public, anon, authenticated;
grant execute on function public.credit_totals(uuid) to service_role;
