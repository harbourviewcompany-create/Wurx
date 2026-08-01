-- Durable Stripe event inbox + immutable price entitlement mapping.
--
-- Stripe delivery is at-least-once and event ordering is not guaranteed. The
-- inbox makes every received event durable before processing, records attempts
-- and failures, and supports explicit replay without double-crediting minutes.

create table if not exists public.stripe_price_entitlements (
  stripe_price_id text primary key,
  plan_id uuid not null references public.plans(id) on delete restrict,
  monthly_minutes integer not null check (monthly_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'cad' check (char_length(currency) = 3),
  created_at timestamptz not null default now()
);

comment on table public.stripe_price_entitlements is
  'Immutable commercial entitlement snapshot keyed by Stripe Price. A changed plan must use a new Stripe Price id.';

insert into public.stripe_price_entitlements (
  stripe_price_id,
  plan_id,
  monthly_minutes,
  price_cents,
  currency
)
select stripe_price_id, id, monthly_minutes, price_cents, 'cad'
from public.plans
where stripe_price_id is not null
on conflict (stripe_price_id) do nothing;

create or replace function public.capture_stripe_price_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stripe_price_id is not null then
    insert into public.stripe_price_entitlements (
      stripe_price_id,
      plan_id,
      monthly_minutes,
      price_cents,
      currency
    ) values (
      new.stripe_price_id,
      new.id,
      new.monthly_minutes,
      new.price_cents,
      'cad'
    )
    on conflict (stripe_price_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_stripe_price_entitlement() from public, anon, authenticated;

drop trigger if exists plans_capture_stripe_entitlement on public.plans;
create trigger plans_capture_stripe_entitlement
after insert or update of stripe_price_id, monthly_minutes, price_cents
on public.plans
for each row execute function public.capture_stripe_price_entitlement();

create or replace function public.prevent_stripe_entitlement_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Stripe price entitlements are immutable; create a new Stripe Price instead';
end;
$$;

revoke all on function public.prevent_stripe_entitlement_mutation() from public, anon, authenticated;

drop trigger if exists stripe_entitlements_immutable on public.stripe_price_entitlements;
create trigger stripe_entitlements_immutable
before update or delete on public.stripe_price_entitlements
for each row execute function public.prevent_stripe_entitlement_mutation();

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  received_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  processed_at timestamptz,
  last_error text,
  replay_requested_at timestamptz,
  replay_requested_by uuid references public.profiles(id) on delete set null
);

comment on table public.stripe_events is
  'Durable, replayable inbox for signed Stripe webhook events. payload is the verified event body.';

create index if not exists stripe_events_status_received_idx
  on public.stripe_events (status, received_at);
create index if not exists stripe_events_failed_idx
  on public.stripe_events (last_attempt_at)
  where status = 'failed';
create index if not exists stripe_events_processing_idx
  on public.stripe_events (last_attempt_at)
  where status = 'processing';

alter table public.stripe_price_entitlements enable row level security;
alter table public.stripe_events enable row level security;

revoke all on table public.stripe_price_entitlements from public, anon, authenticated;
revoke all on table public.stripe_events from public, anon, authenticated;

-- Claim and increment the attempt count in one row lock. A processing claim can
-- be recovered after 15 minutes so a crashed worker cannot strand an event.
create or replace function public.claim_stripe_event(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
begin
  update public.stripe_events
  set
    status = 'processing',
    attempts = attempts + 1,
    last_attempt_at = now(),
    last_error = null
  where event_id = p_event_id
    and (
      status in ('pending', 'failed')
      or (
        status = 'processing'
        and last_attempt_at < now() - interval '15 minutes'
      )
    )
  returning payload into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.claim_stripe_event(text) from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text) to service_role;

-- Admin replay uses the service role only after verifying the caller. Processed
-- events are safe to replay because hour_ledger.stripe_event_id is unique.
-- A stale processing claim is also requeueable for explicit recovery.
create or replace function public.requeue_stripe_event(
  p_event_id text,
  p_requested_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.stripe_events
  set
    status = 'pending',
    processed_at = null,
    last_error = null,
    replay_requested_at = now(),
    replay_requested_by = p_requested_by
  where event_id = p_event_id
    and (
      status <> 'processing'
      or last_attempt_at < now() - interval '15 minutes'
    );

  return found;
end;
$$;

revoke all on function public.requeue_stripe_event(text, uuid) from public, anon, authenticated;
grant execute on function public.requeue_stripe_event(text, uuid) to service_role;
