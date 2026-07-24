-- WURX initial schema
-- Single source of truth for data model. Supabase-only (no Prisma).

create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'provider', 'admin');
create type job_status as enum ('pending', 'matched', 'in_progress', 'completed', 'cancelled');
create type service_type as enum ('cleaning', 'snow_removal', 'landscaping', 'handyman');
create type ledger_entry_type as enum ('credit', 'debit', 'refund', 'adjustment');
create type subscription_status as enum ('active', 'past_due', 'canceled', 'incomplete');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row (customer or provider), created by trigger
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role user_role not null default 'customer',
  stripe_customer_id text unique,
  address text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);
create index profiles_stripe_customer_idx on profiles(stripe_customer_id);

-- ---------------------------------------------------------------------------
-- provider_profiles: extra fields only providers have
-- ---------------------------------------------------------------------------
create table provider_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  skills service_type[] not null default '{}',
  hourly_rate numeric(10,2) not null default 0,
  rating numeric(3,2) not null default 5.0 check (rating >= 0 and rating <= 5),
  rating_count integer not null default 0,
  service_radius_km numeric(6,2) not null default 15,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index provider_profiles_skills_idx on provider_profiles using gin(skills);
create index provider_profiles_available_idx on provider_profiles(is_available);

-- ---------------------------------------------------------------------------
-- subscriptions: one active row per customer per plan cycle
-- ---------------------------------------------------------------------------
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  plan_name text not null,
  hours_included integer not null,
  status subscription_status not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on subscriptions(user_id);
create index subscriptions_status_idx on subscriptions(status);

-- ---------------------------------------------------------------------------
-- hour_ledger: append-only log of hour credits/debits. Balance = sum(amount).
-- ---------------------------------------------------------------------------
create table hour_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  job_id uuid, -- fk added after jobs table exists
  subscription_id uuid references subscriptions(id) on delete set null,
  amount numeric(6,2) not null, -- positive = credit, negative = debit
  type ledger_entry_type not null,
  description text,
  created_at timestamptz not null default now()
);

create index hour_ledger_user_idx on hour_ledger(user_id);
create index hour_ledger_job_idx on hour_ledger(job_id);

-- ---------------------------------------------------------------------------
-- jobs: a booked service request
-- ---------------------------------------------------------------------------
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references profiles(id) on delete cascade,
  provider_id uuid references profiles(id) on delete set null,
  service_type service_type not null,
  title text not null,
  description text,
  status job_status not null default 'pending',
  hours_required numeric(5,2) not null check (hours_required > 0),
  address text,
  lat double precision,
  lng double precision,
  scheduled_at timestamptz,
  matched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hour_ledger
  add constraint hour_ledger_job_fk foreign key (job_id) references jobs(id) on delete set null;

create index jobs_customer_idx on jobs(customer_id);
create index jobs_provider_idx on jobs(provider_id);
create index jobs_status_idx on jobs(status);
create index jobs_service_type_idx on jobs(service_type);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger provider_profiles_set_updated_at before update on provider_profiles
  for each row execute function set_updated_at();
create trigger subscriptions_set_updated_at before update on subscriptions
  for each row execute function set_updated_at();
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create profile row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- hour balance helper view
-- ---------------------------------------------------------------------------
create view hour_balances as
select user_id, coalesce(sum(amount), 0) as balance
from hour_ledger
group by user_id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table provider_profiles enable row level security;
alter table subscriptions enable row level security;
alter table hour_ledger enable row level security;
alter table jobs enable row level security;

-- profiles: everyone can read (needed to show provider names on jobs);
-- only the owner can update their own row. Inserts happen via trigger only.
create policy "profiles are viewable by authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- provider_profiles: readable by all authenticated users (for matching/display),
-- writable only by the provider themself.
create policy "provider profiles are viewable by authenticated users"
  on provider_profiles for select
  using (auth.role() = 'authenticated');

create policy "providers manage own provider profile"
  on provider_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- subscriptions: only visible/manageable by owner. Service role (Edge Functions)
-- bypasses RLS entirely, so Stripe webhook writes are unaffected.
create policy "users view own subscriptions"
  on subscriptions for select
  using (auth.uid() = user_id);

-- hour_ledger: read-only for the owner; all writes happen via service role
-- (Edge Functions, matching API) so no insert/update policy is granted to users.
create policy "users view own hour ledger"
  on hour_ledger for select
  using (auth.uid() = user_id);

-- jobs: customers see their own jobs; providers see jobs assigned to them plus
-- unassigned pending jobs (so they can be matched); customers can create jobs
-- for themselves.
create policy "customers view own jobs"
  on jobs for select
  using (auth.uid() = customer_id);

create policy "providers view assigned or open jobs"
  on jobs for select
  using (
    auth.uid() = provider_id
    or (status = 'pending' and provider_id is null)
  );

create policy "customers create own jobs"
  on jobs for insert
  with check (auth.uid() = customer_id);

create policy "customers cancel own jobs"
  on jobs for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "providers update assigned jobs"
  on jobs for update
  using (auth.uid() = provider_id)
  with check (auth.uid() = provider_id);
