-- ============================================================
-- Marketplace / dispatch layer: availability, job offers,
-- hour holds (reservation), provider earnings, reviews.
-- ============================================================

do $$ begin
  create type public.offer_status as enum ('offered','accepted','declined','expired','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hold_status as enum ('active','captured','released');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('unverified','pending','verified','rejected');
exception when duplicate_object then null; end $$;

-- ---------- economics: not every hour costs the same ----------
-- credit_multiplier: how many CREDIT minutes 1 real minute of this
-- service consumes. Snow shovelling < 1.0, licensed trades > 1.0.
-- Without this, a flat "hour" is a flat price against a variable cost.
alter table public.services
  add column if not exists credit_multiplier numeric(4,2) not null default 1.00
    check (credit_multiplier > 0),
  add column if not exists provider_rate_cents_per_hour integer
    check (provider_rate_cents_per_hour >= 0),
  add column if not exists requires_licensed_provider boolean not null default false;

-- ---------- provider trust / compliance ----------
alter table public.providers
  add column if not exists verification         public.verification_status not null default 'unverified',
  add column if not exists background_check_at  timestamptz,
  add column if not exists insurance_expires_at date,
  add column if not exists date_of_birth        date,
  add column if not exists is_minor             boolean not null default false,
  add column if not exists guardian_consent_at  timestamptz,
  add column if not exists stripe_account_id    text unique,
  add column if not exists payouts_enabled      boolean not null default false,
  add column if not exists base_postal_code     text,
  add column if not exists travel_radius_km     integer not null default 15
    check (travel_radius_km > 0);

-- A provider can only be dispatched once trust gates pass.
create or replace view public.dispatchable_providers
with (security_invoker = on) as
select p.*
from public.providers p
where p.is_active
  and p.verification = 'verified'
  and (p.insurance_expires_at is null or p.insurance_expires_at >= current_date)
  and (p.is_minor = false or p.guardian_consent_at is not null);

-- ---------- availability ----------
create table if not exists public.provider_availability (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.providers(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0=Sunday
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute   smallint not null check (end_minute between 1 and 1440),
  created_at   timestamptz not null default now(),
  constraint availability_window_valid check (end_minute > start_minute)
);
create index if not exists provider_availability_provider_idx
  on public.provider_availability (provider_id, day_of_week);

-- one-off unavailability (vacation, already booked elsewhere)
create table if not exists public.provider_blackouts (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  constraint blackout_window_valid check (ends_at > starts_at)
);
create index if not exists provider_blackouts_provider_idx
  on public.provider_blackouts (provider_id, starts_at);

-- ---------- hour holds: reserve credits at request time ----------
-- Without this a client with 200 min left can open three 180 min
-- bookings before any of them settle.
create table if not exists public.hour_holds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  hold_minutes  integer not null check (hold_minutes > 0),
  status        public.hold_status not null default 'active',
  created_at    timestamptz not null default now(),
  settled_at    timestamptz
);
create unique index if not exists hour_holds_active_per_booking
  on public.hour_holds (booking_id) where status = 'active';
create index if not exists hour_holds_user_idx on public.hour_holds (user_id, status);

-- available balance = settled ledger - active holds
create or replace view public.available_balances
with (security_invoker = on) as
select
  p.id as user_id,
  coalesce((select sum(l.delta_minutes) from public.hour_ledger l
              where l.user_id = p.id), 0)::int as settled_minutes,
  coalesce((select sum(h.hold_minutes) from public.hour_holds h
              where h.user_id = p.id and h.status = 'active'), 0)::int as held_minutes,
  (coalesce((select sum(l.delta_minutes) from public.hour_ledger l
              where l.user_id = p.id), 0)
   - coalesce((select sum(h.hold_minutes) from public.hour_holds h
              where h.user_id = p.id and h.status = 'active'), 0))::int as available_minutes
from public.profiles p;

-- ---------- dispatch: offer jobs to matching providers ----------
create table if not exists public.job_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  status       public.offer_status not null default 'offered',
  offered_at   timestamptz not null default now(),
  responded_at timestamptz,
  expires_at   timestamptz not null default (now() + interval '30 minutes'),
  unique (booking_id, provider_id)
);
-- exactly one provider can hold an accepted offer per booking
create unique index if not exists job_offers_one_accepted_per_booking
  on public.job_offers (booking_id) where status = 'accepted';
create index if not exists job_offers_provider_open_idx
  on public.job_offers (provider_id, status, expires_at);

-- ---------- provider earnings ----------
create table if not exists public.provider_earnings (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.providers(id) on delete cascade,
  booking_id    uuid references public.bookings(id) on delete set null,
  gross_cents   integer not null check (gross_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  net_cents     integer not null check (net_cents >= 0),
  worked_minutes integer not null check (worked_minutes > 0),
  paid_out_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists provider_earnings_provider_idx
  on public.provider_earnings (provider_id, created_at desc);

-- ---------- reviews ----------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (booking_id, author_id)
);
create index if not exists reviews_provider_idx on public.reviews (provider_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.provider_availability enable row level security;
alter table public.provider_blackouts    enable row level security;
alter table public.hour_holds            enable row level security;
alter table public.job_offers            enable row level security;
alter table public.provider_earnings     enable row level security;
alter table public.reviews               enable row level security;

-- availability is public (needed to render the booking calendar)
drop policy if exists availability_select_public on public.provider_availability;
create policy availability_select_public on public.provider_availability
  for select to anon, authenticated using (true);

drop policy if exists availability_write_own on public.provider_availability;
create policy availability_write_own on public.provider_availability
  for all to authenticated
  using  (provider_id in (select id from public.providers where user_id = (select auth.uid())))
  with check (provider_id in (select id from public.providers where user_id = (select auth.uid())));

drop policy if exists blackouts_manage_own on public.provider_blackouts;
create policy blackouts_manage_own on public.provider_blackouts
  for all to authenticated
  using  (provider_id in (select id from public.providers where user_id = (select auth.uid())))
  with check (provider_id in (select id from public.providers where user_id = (select auth.uid())));

-- holds: read own only; created server-side
drop policy if exists holds_select_own on public.hour_holds;
create policy holds_select_own on public.hour_holds
  for select to authenticated using ((select auth.uid()) = user_id);

-- offers: provider sees own offers; client sees offers on own bookings
drop policy if exists offers_select_involved on public.job_offers;
create policy offers_select_involved on public.job_offers
  for select to authenticated using (
    provider_id in (select id from public.providers where user_id = (select auth.uid()))
    or booking_id in (select id from public.bookings where user_id = (select auth.uid()))
  );

-- provider may accept/decline their own offer
drop policy if exists offers_respond_own on public.job_offers;
create policy offers_respond_own on public.job_offers
  for update to authenticated
  using  (provider_id in (select id from public.providers where user_id = (select auth.uid())))
  with check (provider_id in (select id from public.providers where user_id = (select auth.uid())));

drop policy if exists earnings_select_own on public.provider_earnings;
create policy earnings_select_own on public.provider_earnings
  for select to authenticated
  using (provider_id in (select id from public.providers where user_id = (select auth.uid())));

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select to anon, authenticated using (true);

drop policy if exists reviews_insert_own_booking on public.reviews;
create policy reviews_insert_own_booking on public.reviews
  for insert to authenticated with check (
    (select auth.uid()) = author_id
    and booking_id in (select id from public.bookings
                        where user_id = (select auth.uid()) and status = 'completed')
  );

-- ---------- grants ----------
grant select on public.provider_availability, public.provider_blackouts,
                public.reviews, public.dispatchable_providers to anon, authenticated;
grant select on public.hour_holds, public.provider_earnings, public.available_balances to authenticated;
grant select, update on public.job_offers to authenticated;
grant insert on public.reviews to authenticated;
grant insert, update, delete on public.provider_availability, public.provider_blackouts to authenticated;
