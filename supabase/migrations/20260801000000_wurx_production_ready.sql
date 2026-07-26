-- Wurx Platform — Production-Ready Schema Migration
-- Date: 2027-08-01
-- Consolidates all prior migrations + adds missing Phase 2 features + hardening

-- =====================================================================
-- 0. Extensions
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_stat_statements";

-- =====================================================================
-- 1. Types
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum ('pending', 'in_review', 'verified', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('customer', 'provider', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'ledger_entry_type') then
    create type public.ledger_entry_type as enum ('grant', 'consume', 'refund', 'adjustment');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type public.notification_kind as enum (
      'booking_requested', 'booking_confirmed', 'booking_completed', 'booking_cancelled',
      'job_accepted', 'job_completed', 'job_cancelled', 'payout_released',
      'review_received', 'subscription_renewed', 'subscription_cancelled',
      'provider_verified', 'provider_rejected'
    );
  end if;
end
$$;

-- =====================================================================
-- 2. Core Tables
-- =====================================================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'customer',
  stripe_customer_id text,
  email_verified boolean not null default false,
  passkey_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Services catalog
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  credit_multiplier numeric(4,2) not null default 1.00,
  provider_rate_cents_per_hour int not null default 2000,
  base_duration_minutes int not null default 60,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Subscription plans
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  monthly_minutes int not null,
  monthly_price_cents int not null,
  stripe_price_id text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Subscriptions (Stripe mirror)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id),
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hour ledger (immutable double-entry)
create table if not exists public.hour_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta_minutes int not null,
  entry_type public.ledger_entry_type not null,
  description text,
  booking_id uuid,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_event_id text unique,
  created_at timestamptz not null default now()
);

-- Hour holds (pending reservations)
create table if not exists public.hour_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid not null,
  hold_minutes int not null check (hold_minutes > 0),
  status text not null default 'active' check (status in ('active', 'captured', 'released')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Bookings
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id),
  provider_id uuid references public.providers(id) on delete set null,
  status public.booking_status not null default 'requested',
  scheduled_start timestamptz not null,
  duration_minutes int not null check (duration_minutes >= 30),
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  notes text,
  rating int check (rating between 1 and 5),
  review_text text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Providers
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null,
  bio text,
  service_slugs text[] not null default '{}',
  service_areas text[] not null default '{}',
  is_active boolean not null default false,
  verification public.verification_status not null default 'pending',
  rating numeric(3,2),
  total_reviews int not null default 0,
  stripe_connect_account_id text,
  payout_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from bookings to providers after providers exists
alter table public.bookings drop constraint if exists bookings_provider_id_fkey;
alter table public.bookings add constraint bookings_provider_id_fkey
  foreign key (provider_id) references public.providers(id) on delete set null;

-- Provider availability (recurring weekly windows)
create table if not exists public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 1 and 1440),
  constraint valid_window check (end_minute > start_minute)
);

-- Provider blackouts (one-off unavailability)
create table if not exists public.provider_blackouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  constraint valid_blackout check (ends_at > starts_at)
);

-- Job offers (dispatch spine)
create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired')),
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz,
  constraint unique_offer unique (booking_id, provider_id)
);

-- Provider earnings
create table if not exists public.provider_earnings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  gross_cents int not null check (gross_cents >= 0),
  platform_fee_cents int not null check (platform_fee_cents >= 0),
  net_cents int not null check (net_cents >= 0),
  worked_minutes int not null,
  payout_id uuid,
  paid_out_at timestamptz,
  created_at timestamptz not null default now()
);

-- Provider payouts (auditable transfer ledger)
create table if not exists public.provider_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  stripe_transfer_id text not null unique,
  released_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Link earnings to payouts
alter table public.provider_earnings drop constraint if exists provider_earnings_payout_id_fkey;
alter table public.provider_earnings add constraint provider_earnings_payout_id_fkey
  foreign key (payout_id) references public.provider_payouts(id) on delete set null;

-- Reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  text text check (char_length(coalesce(text, '')) <= 2000),
  created_at timestamptz not null default now()
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  booking_id uuid references public.bookings(id) on delete set null,
  read_at timestamptz,
  email_pending boolean not null default true,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

-- App settings (config table)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- Rate limiting
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

-- Audit log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Ottawa leads
create table if not exists public.wurx_ottawa_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  service_interest text,
  message text check (char_length(coalesce(message, '')) <= 2000),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 3. Views
-- =====================================================================

create or replace view public.available_balances as
select
  user_id,
  coalesce(sum(delta_minutes), 0) as available_minutes,
  coalesce(sum(case when status = 'active' then hold_minutes else 0 end), 0) as held_minutes
from public.hour_ledger
left join public.hour_holds using (user_id)
where public.hour_ledger.user_id = public.hour_holds.user_id
or public.hour_holds.user_id is null
group by user_id;

-- Better version: separate CTEs for clarity
create or replace view public.available_balances as
with ledger as (
  select user_id, coalesce(sum(delta_minutes), 0) as total_minutes
  from public.hour_ledger
  group by user_id
),
holds as (
  select user_id, coalesce(sum(hold_minutes), 0) as held_minutes
  from public.hour_holds
  where status = 'active'
  group by user_id
)
select
  coalesce(l.user_id, h.user_id) as user_id,
  coalesce(l.total_minutes, 0) - coalesce(h.held_minutes, 0) as available_minutes,
  coalesce(h.held_minutes, 0) as held_minutes
from ledger l
full outer join holds h on l.user_id = h.user_id;

create or replace view public.dispatchable_providers as
select
  p.*,
  array_agg(distinct pa.day_of_week) as available_days,
  (select count(*) from public.bookings b where b.provider_id = p.id and b.status in ('confirmed', 'in_progress')) as active_jobs
from public.providers p
left join public.provider_availability pa on pa.provider_id = p.id
where p.is_active = true and p.verification = 'verified'
group by p.id;

create or replace view public.provider_dashboard_stats as
select
  p.id as provider_id,
  p.user_id,
  count(distinct b.id) filter (where b.status = 'completed') as jobs_completed,
  count(distinct b.id) filter (where b.status in ('confirmed', 'in_progress')) as jobs_active,
  coalesce(sum(pe.net_cents) filter (where pe.payout_id is null), 0) as pending_earnings_cents,
  coalesce(sum(pe.net_cents) filter (where pe.payout_id is not null), 0) as paid_earnings_cents,
  p.rating,
  p.total_reviews
from public.providers p
left join public.bookings b on b.provider_id = p.id
left join public.provider_earnings pe on pe.provider_id = p.id
group by p.id;

-- =====================================================================
-- 4. Indexes (Performance)
-- =====================================================================
create index if not exists profiles_email_idx on public.profiles(email);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_stripe_customer_idx on public.profiles(stripe_customer_id);

create index if not exists bookings_user_id_idx on public.bookings(user_id);
create index if not exists bookings_service_id_idx on public.bookings(service_id);
create index if not exists bookings_provider_id_idx on public.bookings(provider_id);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_scheduled_start_idx on public.bookings(scheduled_start);
create index if not exists bookings_user_status_idx on public.bookings(user_id, status);

create index if not exists hour_ledger_user_id_idx on public.hour_ledger(user_id);
create index if not exists hour_ledger_booking_id_idx on public.hour_ledger(booking_id);
create index if not exists hour_ledger_subscription_id_idx on public.hour_ledger(subscription_id);
create index if not exists hour_ledger_stripe_event_idx on public.hour_ledger(stripe_event_id);
create index if not exists hour_ledger_created_idx on public.hour_ledger(created_at desc);

create index if not exists hour_holds_user_id_idx on public.hour_holds(user_id);
create index if not exists hour_holds_booking_id_idx on public.hour_holds(booking_id);
create index if not exists hour_holds_status_idx on public.hour_holds(status);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_stripe_id_idx on public.subscriptions(stripe_subscription_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

create index if not exists providers_user_id_idx on public.providers(user_id);
create index if not exists providers_verification_idx on public.providers(verification);
create index if not exists providers_active_idx on public.providers(is_active) where is_active = true;
create index if not exists providers_service_slugs_idx on public.providers using gin(service_slugs);
create index if not exists providers_service_areas_idx on public.providers using gin(service_areas);

create index if not exists provider_availability_provider_idx on public.provider_availability(provider_id);
create index if not exists provider_blackouts_provider_idx on public.provider_blackouts(provider_id);
create index if not exists provider_blackouts_overlap_idx on public.provider_blackouts(provider_id, starts_at, ends_at);

create index if not exists job_offers_booking_idx on public.job_offers(booking_id);
create index if not exists job_offers_provider_idx on public.job_offers(provider_id);
create index if not exists job_offers_status_expires_idx on public.job_offers(status, expires_at);

create index if not exists provider_earnings_provider_idx on public.provider_earnings(provider_id);
create index if not exists provider_earnings_booking_idx on public.provider_earnings(booking_id);
create index if not exists provider_earnings_payout_idx on public.provider_earnings(payout_id) where payout_id is null;

create index if not exists provider_payouts_provider_idx on public.provider_payouts(provider_id);
create index if not exists reviews_provider_idx on public.reviews(provider_id);
create index if not exists reviews_author_idx on public.reviews(author_id);
create index if not exists reviews_booking_idx on public.reviews(booking_id);

create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists notifications_email_queue_idx on public.notifications(created_at) where email_pending = true;
create index if not exists notifications_user_kind_idx on public.notifications(user_id, kind, created_at desc);

create index if not exists audit_log_actor_idx on public.audit_log(actor_id);
create index if not exists audit_log_table_record_idx on public.audit_log(table_name, record_id);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

-- =====================================================================
-- 5. RLS Policies
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.hour_ledger enable row level security;
alter table public.hour_holds enable row level security;
alter table public.bookings enable row level security;
alter table public.providers enable row level security;
alter table public.provider_availability enable row level security;
alter table public.provider_blackouts enable row level security;
alter table public.job_offers enable row level security;
alter table public.provider_earnings enable row level security;
alter table public.provider_payouts enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_log enable row level security;
alter table public.wurx_ottawa_leads enable row level security;

-- Profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or role = 'admin');

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- Services (public read)
drop policy if exists services_select_public on public.services;
create policy services_select_public on public.services for select to anon, authenticated
  using (is_active = true);

-- Plans (public read)
drop policy if exists plans_select_public on public.plans;
create policy plans_select_public on public.plans for select to anon, authenticated
  using (is_active = true);

-- Subscriptions (own only, admin all)
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Hour ledger (own read only)
drop policy if exists ledger_select_own on public.hour_ledger;
create policy ledger_select_own on public.hour_ledger for select to authenticated
  using (user_id = auth.uid());

-- Hour holds (own read only)
drop policy if exists holds_select_own on public.hour_holds;
create policy holds_select_own on public.hour_holds for select to authenticated
  using (user_id = auth.uid());

-- Bookings
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists bookings_select_provider on public.bookings;
create policy bookings_select_provider on public.bookings for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists bookings_select_open on public.bookings;
create policy bookings_select_open on public.bookings for select to authenticated
  using (
    status = 'requested' and provider_id is null
    and exists (
      select 1 from public.providers p
      where p.user_id = auth.uid()
      and public.provider_can_serve_booking(p.id, bookings.id)
    )
  );

drop policy if exists bookings_select_admin on public.bookings;
create policy bookings_select_admin on public.bookings for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Providers
drop policy if exists providers_select_public on public.providers;
create policy providers_select_public on public.providers for select to anon, authenticated
  using (is_active = true and verification = 'verified');

drop policy if exists providers_select_own on public.providers;
create policy providers_select_own on public.providers for select to authenticated
  using (user_id = auth.uid());

drop policy if exists providers_select_admin on public.providers;
create policy providers_select_admin on public.providers for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists providers_update_own on public.providers;
create policy providers_update_own on public.providers for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Availability
drop policy if exists availability_select_own on public.provider_availability;
create policy availability_select_own on public.provider_availability for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists availability_insert_own on public.provider_availability;
create policy availability_insert_own on public.provider_availability for insert to authenticated
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists availability_update_own on public.provider_availability;
create policy availability_update_own on public.provider_availability for update to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists availability_delete_own on public.provider_availability;
create policy availability_delete_own on public.provider_availability for delete to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- Blackouts
drop policy if exists blackouts_select_own on public.provider_blackouts;
create policy blackouts_select_own on public.provider_blackouts for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists blackouts_insert_own on public.provider_blackouts;
create policy blackouts_insert_own on public.provider_blackouts for insert to authenticated
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists blackouts_delete_own on public.provider_blackouts;
create policy blackouts_delete_own on public.provider_blackouts for delete to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- Job offers
drop policy if exists offers_select_provider on public.job_offers;
create policy offers_select_provider on public.job_offers for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- Earnings
drop policy if exists earnings_select_own on public.provider_earnings;
create policy earnings_select_own on public.provider_earnings for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists earnings_select_admin on public.provider_earnings;
create policy earnings_select_admin on public.provider_earnings for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Payouts
drop policy if exists payouts_select_own on public.provider_payouts;
create policy payouts_select_own on public.provider_payouts for select to authenticated
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

drop policy if exists payouts_select_admin on public.provider_payouts;
create policy payouts_select_admin on public.provider_payouts for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Reviews
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews for select to anon, authenticated using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (author_id = auth.uid());

-- Notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- App settings (admin only)
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Rate limits (service role only)
drop policy if exists rate_limits_service on public.rate_limits;
create policy rate_limits_service on public.rate_limits for all to authenticated
  using (false);

-- Audit log (admin read)
drop policy if exists audit_log_admin on public.audit_log;
create policy audit_log_admin on public.audit_log for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Leads (anon insert, admin read)
drop policy if exists leads_insert_anon on public.wurx_ottawa_leads;
create policy leads_insert_anon on public.wurx_ottawa_leads for insert to anon
  with check (
    char_length(name) between 1 and 200
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and char_length(coalesce(message, '')) <= 2000
  );

drop policy if exists leads_select_admin on public.wurx_ottawa_leads;
create policy leads_select_admin on public.wurx_ottawa_leads for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- =====================================================================
-- 6. Helper Functions
-- =====================================================================

-- is_admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- get_setting_int
create or replace function public.get_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

-- get_app_secret (Vault accessor)
create or replace function public.get_app_secret(p_name text)
returns text
language sql
security definer
set search_path = vault, public, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

-- provider_can_serve_booking
create or replace function public.provider_can_serve_booking(p_provider_id uuid, p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_provider record;
  v_booking record;
  v_service_slug text;
  v_fsa text;
  v_dow int;
  v_start_minute int;
  v_end_minute int;
begin
  select * into v_provider from public.providers where id = p_provider_id;
  if v_provider.id is null or not v_provider.is_active then return false; end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then return false; end if;

  select slug into v_service_slug from public.services where id = v_booking.service_id;
  if v_service_slug is null or not (v_service_slug = any(v_provider.service_slugs)) then
    return false;
  end if;

  if v_booking.postal_code is not null and array_length(v_provider.service_areas, 1) > 0 then
    v_fsa := upper(left(regexp_replace(v_booking.postal_code, '\s', '', 'g'), 3));
    if not (v_fsa = any(v_provider.service_areas)) then return false; end if;
  end if;

  v_dow := extract(dow from v_booking.scheduled_start at time zone 'America/Toronto');
  v_start_minute := extract(hour from v_booking.scheduled_start at time zone 'America/Toronto') * 60
    + extract(minute from v_booking.scheduled_start at time zone 'America/Toronto');
  v_end_minute := v_start_minute + v_booking.duration_minutes;

  if exists (select 1 from public.provider_availability where provider_id = p_provider_id) then
    if not exists (
      select 1 from public.provider_availability
      where provider_id = p_provider_id
      and day_of_week = v_dow
      and start_minute <= v_start_minute
      and end_minute >= v_end_minute
    ) then return false; end if;
  end if;

  if exists (
    select 1 from public.provider_blackouts
    where provider_id = p_provider_id
    and starts_at < (v_booking.scheduled_start + make_interval(mins => v_booking.duration_minutes))
    and ends_at > v_booking.scheduled_start
  ) then return false; end if;

  return true;
end;
$function$;

-- =====================================================================
-- 7. Booking Lifecycle RPCs
-- =====================================================================

create or replace function public.request_booking(
  p_service_id uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes int,
  p_address_line1 text,
  p_address_line2 text default null,
  p_city text default null,
  p_postal_code text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_multiplier numeric;
  v_required int;
  v_settled int;
  v_held int;
  v_available int;
  v_booking_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 30 then
    raise exception 'Duration must be at least 30 minutes';
  end if;

  if p_scheduled_start is null or p_scheduled_start <= now() + interval '1 hour' then
    raise exception 'Bookings must be scheduled at least 1 hour in advance';
  end if;

  select credit_multiplier into v_multiplier
  from public.services where id = p_service_id and is_active = true;

  if v_multiplier is null then
    raise exception 'Unknown or inactive service';
  end if;

  v_required := ceil(p_duration_minutes * v_multiplier);

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select coalesce(sum(delta_minutes), 0) into v_settled
  from public.hour_ledger where user_id = v_user;

  select coalesce(sum(hold_minutes), 0) into v_held
  from public.hour_holds where user_id = v_user and status = 'active';

  v_available := v_settled - v_held;

  if v_required > v_available then
    raise exception 'Insufficient minutes: booking needs %, you have %', v_required, v_available;
  end if;

  insert into public.bookings (
    user_id, service_id, status, scheduled_start, duration_minutes,
    address_line1, address_line2, city, postal_code, notes
  ) values (
    v_user, p_service_id, 'requested', p_scheduled_start, p_duration_minutes,
    nullif(trim(p_address_line1), ''), nullif(trim(p_address_line2), ''),
    nullif(trim(p_city), ''), nullif(trim(p_postal_code), ''), nullif(trim(p_notes), '')
  ) returning id into v_booking_id;

  insert into public.hour_holds (user_id, booking_id, hold_minutes, status)
  values (v_user, v_booking_id, v_required, 'active');

  return v_booking_id;
end;
$function$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_status public.booking_status;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select status into v_status
  from public.bookings
  where id = p_booking_id and user_id = v_user
  for update;

  if v_status is null then
    raise exception 'Booking not found';
  end if;

  if v_status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be cancelled';
  end if;

  update public.bookings set status = 'cancelled', updated_at = now()
  where id = p_booking_id;

  update public.hour_holds
  set status = 'released', settled_at = now()
  where booking_id = p_booking_id and status = 'active';
end;
$function$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking record;
  v_hold record;
  v_rate_cents_per_hour int;
  v_gross_cents int;
  v_fee_cents int;
  v_fee_bps int;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select (role = 'admin') into v_is_admin from public.profiles where id = v_user;

  select b.*, p.user_id as provider_user_id
  into v_booking
  from public.bookings b
  left join public.providers p on p.id = b.provider_id
  where b.id = p_booking_id
  for update of b;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if not coalesce(v_is_admin, false)
    and v_booking.provider_user_id is distinct from v_user then
    raise exception 'Not authorised to complete this booking' using errcode = '42501';
  end if;

  if v_booking.status = 'completed' then return; end if;

  update public.bookings set status = 'completed', updated_at = now()
  where id = p_booking_id;

  select * into v_hold
  from public.hour_holds
  where booking_id = p_booking_id and status = 'active'
  for update;

  if v_hold.id is not null then
    update public.hour_holds
    set status = 'captured', settled_at = now()
    where id = v_hold.id;

    insert into public.hour_ledger (user_id, delta_minutes, entry_type, description, booking_id)
    values (v_booking.user_id, -v_hold.hold_minutes, 'consume', 'Service completed', p_booking_id);
  end if;

  if v_booking.provider_id is not null then
    select provider_rate_cents_per_hour into v_rate_cents_per_hour
    from public.services where id = v_booking.service_id;

    if v_rate_cents_per_hour is not null then
      v_fee_bps := public.get_setting_int('platform_fee_bps', 2000);
      v_gross_cents := round(v_booking.duration_minutes / 60.0 * v_rate_cents_per_hour);
      v_fee_cents := round(v_gross_cents * v_fee_bps / 10000.0);

      insert into public.provider_earnings (
        provider_id, booking_id, gross_cents, platform_fee_cents, net_cents, worked_minutes
      ) values (
        v_booking.provider_id, p_booking_id, v_gross_cents, v_fee_cents,
        v_gross_cents - v_fee_cents, v_booking.duration_minutes
      )
      on conflict do nothing;
    end if;
  end if;
end;
$function$;

create or replace function public.claim_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_provider record;
  v_booking record;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_provider from public.providers where user_id = v_user;
  if v_provider.id is null then
    raise exception 'You are not a registered provider';
  end if;
  if not v_provider.is_active then
    raise exception 'Your provider profile is not active';
  end if;

  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update of b;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'requested' or v_booking.provider_id is not null then
    raise exception 'This booking is no longer available';
  end if;

  if not public.provider_can_serve_booking(v_provider.id, p_booking_id) then
    raise exception 'This job is outside your services, area, or availability';
  end if;

  update public.bookings
  set provider_id = v_provider.id, status = 'confirmed', updated_at = now()
  where id = p_booking_id;

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, v_provider.id, 'accepted', now(), now());
end;
$function$;

-- =====================================================================
-- 8. Admin RPCs
-- =====================================================================

create or replace function public.admin_set_provider_status(
  p_provider_id uuid,
  p_verification public.verification_status,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.providers
  set verification = p_verification, is_active = p_is_active, updated_at = now()
  where id = p_provider_id;
end;
$function$;

create or replace function public.admin_assign_booking(p_booking_id uuid, p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.bookings
  set provider_id = p_provider_id, status = 'confirmed', updated_at = now()
  where id = p_booking_id and status = 'requested';

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, p_provider_id, 'accepted', now(), now());
end;
$function$;

create or replace function public.admin_cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_booking record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'Booking not found'; end if;
  if v_booking.status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be cancelled';
  end if;

  update public.bookings set status = 'cancelled', updated_at = now() where id = p_booking_id;
  update public.hour_holds
  set status = 'released', settled_at = now()
  where booking_id = p_booking_id and status = 'active';
end;
$function$;

-- =====================================================================
-- 9. Notification System
-- =====================================================================

create or replace function public.notify_user(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text default null,
  p_booking_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, booking_id)
  values (p_user_id, p_kind, p_title, p_body, p_booking_id);
end;
$function$;

create or replace function public.on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_service text;
  v_provider_user uuid;
  v_when text;
begin
  select name into v_service from public.services where id = new.service_id;
  v_when := to_char(new.scheduled_start at time zone 'America/Toronto', 'Mon DD at FMHH12:MIam');

  if tg_op = 'INSERT' then
    perform public.notify_user(
      new.user_id, 'booking_requested',
      format('%s booked for %s', coalesce(v_service, 'Service'), v_when),
      'We are matching you with a local pro. You will be notified when it is confirmed.',
      new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.provider_id is not null then
      select user_id into v_provider_user from public.providers where id = new.provider_id;
    end if;

    case new.status
      when 'confirmed' then
        perform public.notify_user(new.user_id, 'booking_confirmed',
          format('%s is confirmed for %s', coalesce(v_service, 'Your service'), v_when),
          'A vetted pro has accepted the job.', new.id);
        perform public.notify_user(v_provider_user, 'job_accepted',
          format('You accepted %s on %s', coalesce(v_service, 'a job'), v_when),
          'The customer has been notified.', new.id);
      when 'in_progress' then
        perform public.notify_user(new.user_id, 'booking_confirmed',
          format('%s has started', coalesce(v_service, 'Your service')),
          'Your pro has arrived and begun work.', new.id);
      when 'completed' then
        perform public.notify_user(new.user_id, 'booking_completed',
          format('%s is complete', coalesce(v_service, 'Your service')),
          'Minutes have been deducted from your plan. Leave a review to help other homeowners.', new.id);
        perform public.notify_user(v_provider_user, 'job_completed',
          'Job marked complete', 'Your earnings have been recorded.', new.id);
      when 'cancelled' then
        perform public.notify_user(new.user_id, 'booking_cancelled',
          format('%s was cancelled', coalesce(v_service, 'Your booking')),
          'Any held minutes have been returned to your balance.', new.id);
        perform public.notify_user(v_provider_user, 'job_cancelled',
          'A job you accepted was cancelled', null, new.id);
    end case;
  end if;

  return new;
end;
$function$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify
  after insert or update on public.bookings
  for each row execute function public.on_booking_change();

-- =====================================================================
-- 10. Review Rating Sync
-- =====================================================================

create or replace function public.refresh_provider_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_provider_id uuid;
begin
  v_provider_id := coalesce(new.provider_id, old.provider_id);
  if v_provider_id is null then return coalesce(new, old); end if;

  update public.providers
  set rating = (select round(avg(rating)::numeric, 2) from public.reviews where provider_id = v_provider_id),
      total_reviews = (select count(*) from public.reviews where provider_id = v_provider_id)
  where id = v_provider_id;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_provider_rating();

-- =====================================================================
-- 11. Payout Sync Trigger
-- =====================================================================

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

drop trigger if exists earnings_sync_payout on public.provider_earnings;
create trigger earnings_sync_payout
  before update on public.provider_earnings
  for each row execute function public.sync_earnings_paid_out_at();

-- =====================================================================
-- 12. Audit Logging Trigger
-- =====================================================================

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'DELETE', tg_table_name, old.id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'UPDATE', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
    values (auth.uid(), 'INSERT', tg_table_name, new.id, to_jsonb(new));
    return new;
  end if;
  return null;
end;
$function$;

-- Apply audit to sensitive tables
drop trigger if exists audit_bookings on public.bookings;
create trigger audit_bookings after insert or update or delete on public.bookings
  for each row execute function public.audit_trigger();

drop trigger if exists audit_providers on public.providers;
create trigger audit_providers after insert or update or delete on public.providers
  for each row execute function public.audit_trigger();

drop trigger if exists audit_subscriptions on public.subscriptions;
create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function public.audit_trigger();

-- =====================================================================
-- 13. Housekeeping (pg_cron)
-- =====================================================================

create or replace function public.expire_abandoned_bookings()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_count int;
begin
  with stale as (
    select id from public.bookings
    where status = 'requested' and provider_id is null
    and scheduled_start < now() - interval '15 minutes'
    for update skip locked
  ), cancelled as (
    update public.bookings b set status = 'cancelled', updated_at = now()
    from stale s where b.id = s.id returning b.id
  ), released as (
    update public.hour_holds h set status = 'released', settled_at = now()
    from cancelled c where h.booking_id = c.id and h.status = 'active'
    returning h.id
  )
  select count(*) into v_count from cancelled;
  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_count int;
begin
  update public.job_offers
  set status = 'expired', responded_at = now()
  where status = 'offered' and expires_at < now();
  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$function$;

-- Schedule cron jobs
select cron.unschedule('wurx-expire-offers') where exists (select 1 from cron.job where jobname = 'wurx-expire-offers');
select cron.unschedule('wurx-expire-bookings') where exists (select 1 from cron.job where jobname = 'wurx-expire-bookings');
select cron.unschedule('wurx-rate-limit-cleanup') where exists (select 1 from cron.job where jobname = 'wurx-rate-limit-cleanup');

select cron.schedule('wurx-expire-offers', '*/5 * * * *',
  $cron$select public.expire_stale_offers();$cron$);
select cron.schedule('wurx-expire-bookings', '*/15 * * * *',
  $cron$select public.expire_abandoned_bookings();$cron$);
select cron.schedule('wurx-rate-limit-cleanup', '0 * * * *',
  $cron$delete from public.rate_limits where window_start < now() - interval '1 hour';$cron$);

-- =====================================================================
-- 14. Realtime Publication
-- =====================================================================

-- Enable realtime for key tables
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
  alter publication supabase_realtime add table public.bookings;
  alter publication supabase_realtime add table public.notifications;
  alter publication supabase_realtime add table public.job_offers;
commit;

-- =====================================================================
-- 15. Default Data
-- =====================================================================

insert into public.app_settings (key, value, description)
values
  ('platform_fee_bps', '2000'::jsonb, 'Platform commission in basis points (2000 = 20%)'),
  ('offer_ttl_minutes', '30'::jsonb, 'How long a dispatched job offer stays open'),
  ('booking_min_advance_minutes', '60'::jsonb, 'Minimum advance booking time'),
  ('max_booking_duration_minutes', '480'::jsonb, 'Maximum single booking duration (8 hours)'),
  ('auto_complete_hours', '24'::jsonb, 'Hours after scheduled end to auto-complete'),
  ('site_name', '"Wurx"'::jsonb, 'Platform display name'),
  ('support_email', '"hello@wurx.ca"'::jsonb, 'Customer support email')
on conflict (key) do nothing;

insert into public.services (slug, name, description, icon, credit_multiplier, provider_rate_cents_per_hour, sort_order)
values
  ('cleaning', 'Home Cleaning', 'Professional home cleaning services', 'Sparkles', 1.00, 2500, 1),
  ('snow-removal', 'Snow Removal', 'Driveway and walkway snow clearing', 'Snowflake', 0.75, 3000, 2),
  ('lawn-care', 'Lawn Care', 'Mowing, edging, and yard maintenance', 'TreePine', 0.80, 2200, 3),
  ('handyman', 'Handyman', 'Repairs, installations, and odd jobs', 'Wrench', 1.50, 3500, 4),
  ('window-cleaning', 'Window Cleaning', 'Interior and exterior window washing', 'PanelTopOpen', 1.10, 2800, 5)
on conflict (slug) do nothing;

insert into public.plans (slug, name, description, monthly_minutes, monthly_price_cents, stripe_price_id, sort_order)
values
  ('starter', 'Starter', 'Perfect for small homes and light maintenance', 240, 17900, 'price_1TwrHMHGqu2rN3IenoKKADzP', 1),
  ('home', 'Home', 'Our most popular plan for busy families', 480, 33900, 'price_1TwrHZHGqu2rN3IeEx6f5bzV', 2),
  ('plus', 'Plus', 'Maximum coverage for large properties', 960, 62900, 'price_1TwrHyHGqu2rN3IeTP0gbIBV', 3)
on conflict (slug) do nothing;

-- =====================================================================
-- 16. RPC Lockdown (Revoke anon/public)
-- =====================================================================

revoke all on function public.request_booking(uuid, timestamptz, int, text, text, text, text, text) from anon, public;
revoke all on function public.cancel_booking(uuid) from anon, public;
revoke all on function public.complete_booking(uuid) from anon, public;
revoke all on function public.claim_booking(uuid) from anon, public;
revoke all on function public.admin_set_provider_status(uuid, public.verification_status, boolean) from anon, public;
revoke all on function public.admin_assign_booking(uuid, uuid) from anon, public;
revoke all on function public.admin_cancel_booking(uuid) from anon, public;
revoke all on function public.is_admin() from anon, public;
revoke all on function public.get_setting_int(text, int) from anon, public;
revoke all on function public.get_app_secret(text) from anon, public, authenticated;
revoke all on function public.provider_can_serve_booking(uuid, uuid) from anon, public;
revoke all on function public.notify_user(uuid, public.notification_kind, text, text, uuid) from anon, public, authenticated;
revoke all on function public.expire_abandoned_bookings() from anon, public, authenticated;
revoke all on function public.expire_stale_offers() from anon, public, authenticated;
revoke all on function public.refresh_provider_rating() from anon, public, authenticated;
revoke all on function public.on_booking_change() from anon, public, authenticated;
revoke all on function public.sync_earnings_paid_out_at() from anon, public, authenticated;
revoke all on function public.audit_trigger() from anon, public, authenticated;

grant execute on function public.request_booking(uuid, timestamptz, int, text, text, text, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.claim_booking(uuid) to authenticated;
grant execute on function public.admin_set_provider_status(uuid, public.verification_status, boolean) to authenticated;
grant execute on function public.admin_assign_booking(uuid, uuid) to authenticated;
grant execute on function public.admin_cancel_booking(uuid) to authenticated;
grant execute on function public.provider_can_serve_booking(uuid, uuid) to authenticated;
grant execute on function public.get_app_secret(text) to service_role;
