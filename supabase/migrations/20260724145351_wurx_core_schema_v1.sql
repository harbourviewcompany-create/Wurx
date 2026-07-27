-- ============================================================
-- Wurx core schema: profiles, plans, subscriptions, hour ledger,
-- services, providers, bookings.
-- Credits are stored in INTEGER MINUTES to avoid float drift.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type public.user_role as enum ('customer','provider','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum
    ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ledger_entry_type as enum ('grant','consume','adjustment','refund','expiry');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum
    ('requested','confirmed','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- shared updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  full_name          text,
  phone              text,
  address_line1      text,
  city               text,
  province           text default 'ON',
  postal_code        text,
  role               public.user_role not null default 'customer',
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists profiles_postal_code_idx on public.profiles (postal_code);
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- plans ----------
create table if not exists public.plans (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  stripe_price_id text unique,
  monthly_minutes integer not null check (monthly_minutes > 0),
  price_cents     integer not null check (price_cents >= 0),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- ---------- subscriptions ----------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_id                uuid references public.plans(id),
  stripe_subscription_id text unique,
  stripe_price_id        text,
  status                 public.subscription_status not null default 'incomplete',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------- services catalogue ----------
create table if not exists public.services (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  name                     text not null,
  description              text,
  icon                     text,
  default_duration_minutes integer not null default 120,
  sort_order               integer not null default 0,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now()
);

-- ---------- providers (local matching) ----------
create table if not exists public.providers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references public.profiles(id) on delete cascade,
  business_name  text not null,
  bio            text,
  service_slugs  text[] not null default '{}',
  service_areas  text[] not null default '{}', -- FSA prefixes, e.g. {K1A,K2B}
  rating         numeric(3,2) check (rating >= 0 and rating <= 5),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists providers_service_areas_idx on public.providers using gin (service_areas);
create index if not exists providers_service_slugs_idx on public.providers using gin (service_slugs);

drop trigger if exists providers_set_updated_at on public.providers;
create trigger providers_set_updated_at before update on public.providers
  for each row execute function public.set_updated_at();

-- ---------- bookings ----------
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  service_id       uuid not null references public.services(id),
  provider_id      uuid references public.providers(id) on delete set null,
  status           public.booking_status not null default 'requested',
  scheduled_start  timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  address_line1    text,
  city             text,
  postal_code      text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists bookings_user_idx on public.bookings (user_id);
create index if not exists bookings_provider_idx on public.bookings (provider_id);
create index if not exists bookings_scheduled_idx on public.bookings (scheduled_start);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------- hour ledger (append-only) ----------
create table if not exists public.hour_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  delta_minutes   integer not null check (delta_minutes <> 0),
  entry_type      public.ledger_entry_type not null,
  description     text,
  booking_id      uuid references public.bookings(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  -- idempotency guard: Stripe retries webhooks, this prevents double-crediting
  stripe_event_id text unique,
  created_at      timestamptz not null default now()
);
create index if not exists hour_ledger_user_idx on public.hour_ledger (user_id, created_at desc);

-- balance view (security_invoker so RLS on base table governs)
create or replace view public.hour_balances
with (security_invoker = on) as
select
  p.id                                  as user_id,
  coalesce(sum(l.delta_minutes), 0)::int as balance_minutes,
  round(coalesce(sum(l.delta_minutes), 0) / 60.0, 2) as balance_hours
from public.profiles p
left join public.hour_ledger l on l.user_id = p.id
group by p.id;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.services      enable row level security;
alter table public.providers     enable row level security;
alter table public.bookings      enable row level security;
alter table public.hour_ledger   enable row level security;

-- profiles: own row only
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- plans + services: public catalogue, read-only
drop policy if exists plans_select_public on public.plans;
create policy plans_select_public on public.plans
  for select to anon, authenticated using (is_active);

drop policy if exists services_select_public on public.services;
create policy services_select_public on public.services
  for select to anon, authenticated using (is_active);

-- providers: active providers publicly visible; own row editable
drop policy if exists providers_select_public on public.providers;
create policy providers_select_public on public.providers
  for select to anon, authenticated using (is_active);

drop policy if exists providers_update_own on public.providers;
create policy providers_update_own on public.providers
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- subscriptions: read own. Writes are service-role only (webhook).
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- hour_ledger: read own only. NO client insert -- ledger integrity
-- is enforced by writing exclusively via service role / RPC.
drop policy if exists hour_ledger_select_own on public.hour_ledger;
create policy hour_ledger_select_own on public.hour_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

-- bookings: full CRUD on own rows; assigned provider can read
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select to authenticated using (
    (select auth.uid()) = user_id
    or provider_id in (
      select id from public.providers where user_id = (select auth.uid())
    )
  );

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists bookings_update_own on public.bookings;
create policy bookings_update_own on public.bookings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- grants ----------
grant select on public.plans, public.services, public.providers to anon, authenticated;
grant select on public.hour_balances to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.subscriptions, public.hour_ledger to authenticated;
grant select, insert, update on public.bookings to authenticated;
