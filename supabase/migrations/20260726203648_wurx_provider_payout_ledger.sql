-- provider_earnings has been accruing with a paid_out_at column that
-- nothing ever set -- payouts_enabled/Connect onboarding exists
-- (provider-payouts function) but there was no actual transfer path.
--
-- This adds a payout ledger (one row per released transfer, auditable:
-- who released it, how much, which Stripe transfer) and links earnings
-- rows to the payout that paid them, so "unpaid" is just
-- `payout_id is null` rather than relying on a bare timestamp with no
-- reference to what actually moved the money.
--
-- Written in 2026-07-26 but never applied live until now -- discovered
-- while reconciling the migrations folder against the live DB. Without it,
-- supabase/functions/provider-payouts' admin_payout action (which writes
-- to provider_payouts and provider_earnings.payout_id) was broken: both
-- didn't exist yet.

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

-- Providers can see their own payout history (read-only -- releasing one
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
