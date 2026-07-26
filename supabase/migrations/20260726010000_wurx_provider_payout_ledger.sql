-- provider_earnings has been accruing with a paid_out_at column that
-- nothing ever set — payouts_enabled/Connect onboarding exists
-- (provider-payouts function) but there was no actual transfer path.
--
-- This adds a payout ledger (one row per released transfer, auditable:
-- who released it, how much, which Stripe transfer) and links earnings
-- rows to the payout that paid them, so "unpaid" is just
-- `payout_id is null` rather than relying on a bare timestamp with no
-- reference to what actually moved the money.

create table public.provider_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  stripe_transfer_id text not null unique,
  released_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.provider_earnings
  add column payout_id uuid references public.provider_payouts(id);

create index provider_payouts_provider_idx on public.provider_payouts(provider_id);
create index provider_earnings_payout_idx on public.provider_earnings(payout_id) where payout_id is null;

alter table public.provider_payouts enable row level security;

-- Providers can see their own payout history (read-only — releasing one
-- happens exclusively through the service-role edge function).
create policy providers_select_own_payouts on public.provider_payouts
  for select
  using (
    provider_id in (select id from public.providers where user_id = auth.uid())
  );

-- Admins can see all payouts (for the admin panel's balance display).
create policy admin_select_all_payouts on public.provider_payouts
  for select
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Also stamp provider_earnings.paid_out_at when a payout_id is attached,
-- so the existing column stays meaningful for anything already reading it
-- instead of becoming a second, easily-desynced source of truth.
create or replace function public.sync_earnings_paid_out_at()
returns trigger
language plpgsql
as $function$
begin
  if new.payout_id is not null and old.payout_id is null then
    new.paid_out_at := now();
  end if;
  return new;
end;
$function$;

create trigger provider_earnings_sync_paid_out_at
  before update on public.provider_earnings
  for each row
  execute function public.sync_earnings_paid_out_at();
