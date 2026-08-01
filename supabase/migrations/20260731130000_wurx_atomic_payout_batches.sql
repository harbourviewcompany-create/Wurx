-- Atomic provider payout batching.
--
-- Earnings are attached to a durable batch before Stripe is called. Repeated or
-- concurrent requests reuse the same batch and Stripe idempotency key, so the
-- same earnings cannot fund two transfers. Ambiguous failures keep earnings
-- attached for operator reconciliation rather than making them claimable again.

alter table public.provider_payouts
  alter column stripe_transfer_id drop not null;

alter table public.provider_payouts
  add column if not exists status text,
  add column if not exists idempotency_key text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text;

update public.provider_payouts
set
  status = coalesce(status, 'paid'),
  idempotency_key = coalesce(idempotency_key, 'legacy-payout-' || id::text),
  completed_at = coalesce(completed_at, created_at),
  updated_at = coalesce(updated_at, created_at)
where status is null
   or idempotency_key is null
   or completed_at is null;

alter table public.provider_payouts
  alter column status set default 'pending',
  alter column status set not null,
  alter column idempotency_key set not null;

alter table public.provider_payouts
  drop constraint if exists provider_payouts_status_check;
alter table public.provider_payouts
  add constraint provider_payouts_status_check
  check (status in ('pending', 'transferring', 'paid', 'failed', 'reconciliation_required'));

create unique index if not exists provider_payouts_idempotency_key_uidx
  on public.provider_payouts (idempotency_key);
create unique index if not exists provider_payouts_transfer_uidx
  on public.provider_payouts (stripe_transfer_id)
  where stripe_transfer_id is not null;
create index if not exists provider_payouts_provider_status_idx
  on public.provider_payouts (provider_id, status, created_at desc);

create or replace function public.prevent_provider_payout_transfer_id_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.stripe_transfer_id is not null
     and new.stripe_transfer_id is distinct from old.stripe_transfer_id
  then
    raise exception 'Provider payout Stripe transfer id is immutable once recorded';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_provider_payout_transfer_id_mutation()
  from public, anon, authenticated;

drop trigger if exists provider_payout_transfer_id_immutable on public.provider_payouts;
create trigger provider_payout_transfer_id_immutable
before update of stripe_transfer_id on public.provider_payouts
for each row execute function public.prevent_provider_payout_transfer_id_mutation();

create or replace function public.claim_provider_payout_batch(
  p_provider_id uuid,
  p_released_by uuid
)
returns table (
  batch_id uuid,
  provider_id uuid,
  amount_cents integer,
  stripe_account_id text,
  idempotency_key text,
  stripe_transfer_id text,
  batch_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider public.providers%rowtype;
  v_existing public.provider_payouts%rowtype;
  v_earning_ids uuid[];
  v_amount integer;
  v_batch_id uuid;
  v_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text, 41001));

  select * into v_provider
  from public.providers
  where id = p_provider_id
  for update;

  if v_provider.id is null then
    raise exception 'Provider not found';
  end if;
  if v_provider.stripe_account_id is null or not v_provider.payouts_enabled then
    raise exception 'Provider has not completed payout onboarding';
  end if;

  select pp.* into v_existing
  from public.provider_payouts pp
  where pp.provider_id = p_provider_id
    and pp.status in ('pending', 'transferring', 'failed', 'reconciliation_required')
  order by pp.created_at desc
  limit 1
  for update;

  if v_existing.id is not null then
    return query select
      v_existing.id,
      v_existing.provider_id,
      v_existing.amount_cents,
      v_provider.stripe_account_id,
      v_existing.idempotency_key,
      v_existing.stripe_transfer_id,
      v_existing.status;
    return;
  end if;

  select array_agg(locked.id), coalesce(sum(locked.net_cents), 0)::integer
  into v_earning_ids, v_amount
  from (
    select e.id, e.net_cents
    from public.provider_earnings e
    where e.provider_id = p_provider_id
      and e.payout_id is null
    order by e.created_at, e.id
    for update
  ) locked;

  if v_amount <= 0 or v_earning_ids is null then
    return;
  end if;

  v_batch_id := gen_random_uuid();
  v_key := 'wurx-payout-' || v_batch_id::text;

  insert into public.provider_payouts (
    id,
    provider_id,
    amount_cents,
    stripe_transfer_id,
    released_by,
    status,
    idempotency_key,
    updated_at
  ) values (
    v_batch_id,
    p_provider_id,
    v_amount,
    null,
    p_released_by,
    'pending',
    v_key,
    now()
  );

  update public.provider_earnings
  set payout_id = v_batch_id
  where id = any(v_earning_ids)
    and payout_id is null;

  if not found then
    raise exception 'Payout earnings claim was lost';
  end if;

  return query select
    v_batch_id,
    p_provider_id,
    v_amount,
    v_provider.stripe_account_id,
    v_key,
    null::text,
    'pending'::text;
end;
$$;

create or replace function public.mark_provider_payout_transferring(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.provider_payouts
  set status = 'transferring', updated_at = now(), last_error = null
  where id = p_batch_id
    and status in ('pending', 'failed', 'transferring')
    and stripe_transfer_id is null;
  return found;
end;
$$;

create or replace function public.finalize_provider_payout_batch(
  p_batch_id uuid,
  p_stripe_transfer_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_batch_id::text, 41002));

  if nullif(p_stripe_transfer_id, '') is null then
    raise exception 'Stripe transfer id is required';
  end if;

  update public.provider_payouts
  set
    status = 'paid',
    stripe_transfer_id = p_stripe_transfer_id,
    completed_at = coalesce(completed_at, now()),
    updated_at = now(),
    last_error = null
  where id = p_batch_id
    and (
      stripe_transfer_id is null
      or stripe_transfer_id = p_stripe_transfer_id
    );

  if not found then
    return false;
  end if;

  update public.provider_earnings
  set paid_out_at = coalesce(paid_out_at, now())
  where payout_id = p_batch_id;

  return true;
end;
$$;

drop function if exists public.mark_provider_payout_issue(uuid, text, text);
create or replace function public.mark_provider_payout_issue(
  p_batch_id uuid,
  p_error text,
  p_stripe_transfer_id text default null,
  p_reconciliation_required boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.provider_payouts
  set
    status = case
      when p_reconciliation_required or p_stripe_transfer_id is not null
        then 'reconciliation_required'
      else 'failed'
    end,
    stripe_transfer_id = coalesce(p_stripe_transfer_id, stripe_transfer_id),
    last_error = left(coalesce(p_error, 'Unknown payout failure'), 2000),
    updated_at = now()
  where id = p_batch_id
    and status <> 'paid'
    and (
      stripe_transfer_id is null
      or p_stripe_transfer_id is null
      or stripe_transfer_id = p_stripe_transfer_id
    );
  return found;
end;
$$;

revoke all on function public.claim_provider_payout_batch(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.mark_provider_payout_transferring(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_provider_payout_batch(uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_provider_payout_issue(uuid, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.claim_provider_payout_batch(uuid, uuid) to service_role;
grant execute on function public.mark_provider_payout_transferring(uuid) to service_role;
grant execute on function public.finalize_provider_payout_batch(uuid, text) to service_role;
grant execute on function public.mark_provider_payout_issue(uuid, text, text, boolean) to service_role;
