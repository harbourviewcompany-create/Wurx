-- Reconcile repo <-> live, and close the provider self-verification hole.
--
-- Two problems this fixes:
--
-- 1. SELF-VERIFICATION (live vulnerability). `providers_insert_own` forces new
--    provider rows to is_active=false / verification='unverified', but
--    `providers_update_own` had no column restriction and `authenticated` holds
--    UPDATE grants on verification/payouts_enabled/rating. So a user could sign
--    up, then immediately UPDATE their own row to verification='verified',
--    rating=5.0 — defeating the INSERT hardening and every verification check in
--    claim_booking / provider_can_serve_booking.
--
-- 2. DRIFT. Several hardenings existed only in the live database and in no
--    migration (guard_profile_role_change, the hardened providers_insert_own,
--    the verification checks in claim_booking / provider_can_serve_booking, and
--    the open-jobs policy delegating to provider_can_serve_booking). Rebuilding
--    from migrations — a new environment, staging, or `supabase db reset` —
--    silently reintroduced every hole. Everything below is idempotent and is now
--    the source of truth.

-- =====================================================================
-- is_admin(): unchanged, restated so this migration is self-contained.
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- =====================================================================
-- 1. Profile role guard.
--
-- Previously this blocked ANY role -> 'admin' change whenever auth.uid() was
-- set, including a legitimate admin promoting someone through the admin panel
-- (app/admin/actions.ts setUserRole), which always failed with
-- "Cannot self-assign admin role". Now only non-admins are blocked.
-- =====================================================================
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and new.role = 'admin'
     and old.role <> 'admin'
     and not public.is_admin()
  then
    raise exception 'Only an admin can grant the admin role' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- =====================================================================
-- 2. Provider privileged-column guard (the critical fix).
--
-- Trust signals and compliance fields are set by admins (or by Stripe), never
-- by the provider themselves. Values are silently reverted rather than raising,
-- so a provider editing their bio/services/areas still succeeds — they simply
-- cannot move these columns. is_active is intentionally NOT guarded so a
-- provider can still pause/resume their own availability.
-- =====================================================================
-- The 'wurx.rating_sync' escape hatch below lets refresh_provider_rating()
-- (a SECURITY DEFINER trigger on public.reviews that still runs with auth.uid()
-- set) write providers.rating without the guard reverting it.
create or replace function public.guard_provider_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('wurx.rating_sync', true), 'off') = 'on' then
    return new;
  end if;

  if auth.uid() is not null and not public.is_admin() then
    new.verification         := old.verification;
    new.payouts_enabled      := old.payouts_enabled;
    new.rating               := old.rating;
    new.stripe_account_id    := old.stripe_account_id;
    new.background_check_at  := old.background_check_at;
    new.insurance_expires_at := old.insurance_expires_at;
    new.is_minor             := old.is_minor;
    new.guardian_consent_at  := old.guardian_consent_at;
  end if;
  return new;
end;
$$;

drop trigger if exists providers_guard_privileged_columns on public.providers;
create trigger providers_guard_privileged_columns
  before update on public.providers
  for each row execute function public.guard_provider_privileged_columns();

-- Rating stays system-maintained: set the escape-hatch flag around the write.
create or replace function public.refresh_provider_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_provider_id uuid;
  v_avg numeric;
begin
  v_provider_id := coalesce(new.provider_id, old.provider_id);
  if v_provider_id is null then
    return coalesce(new, old);
  end if;

  select round(avg(rating)::numeric, 2) into v_avg
  from public.reviews where provider_id = v_provider_id;

  perform set_config('wurx.rating_sync', 'on', true);
  update public.providers set rating = v_avg where id = v_provider_id;
  perform set_config('wurx.rating_sync', 'off', true);

  return coalesce(new, old);
end;
$$;

-- =====================================================================
-- 3. Only verified providers are publicly listed.
--
-- providers_select_public gated on is_active alone, so an unverified provider
-- who self-activated would still appear in public provider listings.
-- =====================================================================
drop policy if exists providers_select_public on public.providers;
create policy providers_select_public on public.providers
  for select to anon, authenticated
  using (is_active and verification = 'verified');

-- =====================================================================
-- 4. Reconcile the hardened definitions that existed only in the live DB.
-- =====================================================================

-- Provider signup: cannot self-activate or self-verify at insert time.
drop policy if exists providers_insert_own on public.providers;
create policy providers_insert_own on public.providers
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_active = false
    and verification = 'unverified'
  );

-- Full eligibility check: verification, insurance, guardian consent, service,
-- service area (Canadian FSA), weekly availability, and blackout overlap.
create or replace function public.provider_can_serve_booking(p_provider_id uuid, p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  if v_provider.id is null
     or not v_provider.is_active
     or v_provider.verification <> 'verified'
     or (v_provider.insurance_expires_at is not null and v_provider.insurance_expires_at < current_date)
     or (v_provider.is_minor and v_provider.guardian_consent_at is null)
  then
    return false;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return false;
  end if;

  select s.slug into v_service_slug from public.services s where s.id = v_booking.service_id;
  if v_service_slug is null or not (v_service_slug = any(v_provider.service_slugs)) then
    return false;
  end if;

  if v_booking.postal_code is not null and array_length(v_provider.service_areas, 1) > 0 then
    v_fsa := upper(left(regexp_replace(v_booking.postal_code, '\s', '', 'g'), 3));
    if not (v_fsa = any(v_provider.service_areas)) then
      return false;
    end if;
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
    ) then
      return false;
    end if;
  end if;

  if exists (
    select 1 from public.provider_blackouts
    where provider_id = p_provider_id
      and starts_at < (v_booking.scheduled_start + make_interval(mins => v_booking.duration_minutes))
      and ends_at > v_booking.scheduled_start
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- Open jobs are visible only to providers actually eligible to serve them, so
-- customer addresses are never exposed to unverified or out-of-area providers.
drop policy if exists bookings_select_open_for_providers on public.bookings;
create policy bookings_select_open_for_providers on public.bookings
  for select to authenticated
  using (
    status = 'requested'
    and provider_id is null
    and exists (
      select 1 from public.providers p
      where p.user_id = auth.uid()
        and public.provider_can_serve_booking(p.id, bookings.id)
    )
  );

-- Claim: verified + eligible only, with row locking to prevent double-claims.
create or replace function public.claim_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  if not v_provider.is_active or v_provider.verification <> 'verified' then
    raise exception 'Your provider profile is not verified yet';
  end if;

  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update of b;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'requested' or v_booking.provider_id is not null then
    raise exception 'This booking is no longer available';
  end if;

  if not public.provider_can_serve_booking(v_provider.id, p_booking_id) then
    raise exception 'This job is outside the services, area, or availability on your profile';
  end if;

  update public.bookings
  set provider_id = v_provider.id, status = 'confirmed', updated_at = now()
  where id = p_booking_id;

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, v_provider.id, 'accepted', now(), now());
end;
$$;

revoke all on function public.claim_booking(uuid) from public, anon;
grant execute on function public.claim_booking(uuid) to authenticated;

-- =====================================================================
-- 5. Admin assignment must respect eligibility too.
--
-- admin_assign_booking previously assigned any provider to any booking. It now
-- refuses ineligible providers unless explicitly overridden, and (as before)
-- sets status and records the job_offer — which the admin UI's plain
-- `update({provider_id})` never did.
-- =====================================================================
create or replace function public.admin_assign_booking(
  p_booking_id uuid,
  p_provider_id uuid,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if not p_force and not public.provider_can_serve_booking(p_provider_id, p_booking_id) then
    raise exception 'That provider is not eligible for this booking (service, area, availability, or verification)';
  end if;

  update public.bookings
  set provider_id = p_provider_id, status = 'confirmed', updated_at = now()
  where id = p_booking_id and status = 'requested';

  if not found then
    raise exception 'Booking is not open for assignment';
  end if;

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, p_provider_id, 'accepted', now(), now());
end;
$$;

revoke all on function public.admin_assign_booking(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_assign_booking(uuid, uuid, boolean) to authenticated;
