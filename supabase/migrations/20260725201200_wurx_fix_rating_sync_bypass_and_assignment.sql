-- CRITICAL: 'wurx.rating_sync' is a non-reserved custom GUC, so ANY authenticated
-- caller can set it and then update providers directly, skipping the guard.
-- Require nested-trigger context as well, which a client cannot fake.
create or replace function public.guard_provider_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('wurx.rating_sync', true), 'off') = 'on'
     and pg_trigger_depth() > 1
  then
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

-- Non-admins may not change roles at all (previously only admin grants blocked).
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_admin()
  then
    raise exception 'Only an admin can change a profile role' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Providers must still be able to read their own (unverified) profile; the
-- public policy now requires verification = 'verified'.
drop policy if exists providers_select_own on public.providers;
create policy providers_select_own on public.providers
  for select to authenticated
  using (auth.uid() = user_id);

-- Cheap prefilter so the expensive eligibility function runs on fewer rows.
drop policy if exists bookings_select_open_for_providers on public.bookings;
create policy bookings_select_open_for_providers on public.bookings
  for select to authenticated
  using (
    status = 'requested'
    and provider_id is null
    and exists (
      select 1 from public.providers p
      where p.user_id = auth.uid()
        and p.is_active
        and p.verification = 'verified'
        and public.provider_can_serve_booking(p.id, bookings.id)
    )
  );

create index if not exists bookings_open_dispatch_idx
  on public.bookings (scheduled_start)
  where status = 'requested' and provider_id is null;
create index if not exists provider_availability_provider_dow_idx
  on public.provider_availability (provider_id, day_of_week);
create index if not exists provider_blackouts_provider_window_idx
  on public.provider_blackouts (provider_id, starts_at, ends_at);

-- The 2-arg version must go, otherwise 2-argument named calls are ambiguous
-- against the new 3-arg overload.
drop function if exists public.admin_assign_booking(uuid, uuid);

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

  -- Retire any earlier accepted offer so history has a single active offer.
  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = p_booking_id and status = 'accepted';

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, p_provider_id, 'accepted', now(), now());
end;
$$;

revoke all on function public.admin_assign_booking(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_assign_booking(uuid, uuid, boolean) to authenticated;

-- State-checked unassignment: a raw update could reopen a completed or
-- cancelled booking and left the accepted offer dangling.
create or replace function public.admin_unassign_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_booking record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be unassigned';
  end if;

  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = p_booking_id and status = 'accepted';

  update public.bookings
  set provider_id = null, status = 'requested', updated_at = now()
  where id = p_booking_id;
end;
$$;

revoke all on function public.admin_unassign_booking(uuid) from public, anon;
grant execute on function public.admin_unassign_booking(uuid) to authenticated;
