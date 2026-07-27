-- Admin panel access: a reusable is_admin() check plus permissive
-- "admin can do anything" policies layered on top of the existing
-- owner-scoped RLS policies (Postgres RLS policies are OR'd together,
-- so this adds admin access without needing to know or touch whatever
-- policies already exist on these tables).
--
-- NOTE: is_admin() and admin-select policies for bookings/providers already
-- exist live (added later, under different names, by
-- provider_earnings_and_admin_console / wurx_reconcile_and_harden_provider_trust).
-- This migration only adds what's still actually missing: profiles, plans,
-- services, hour_ledger, hour_holds admin policies, plus the cancel_booking
-- admin-bypass fix. Written in 2026-07-25 but never applied live until now —
-- discovered while reconciling the migrations folder against the live DB;
-- without it, /admin/users, /admin/plans, /admin/services, and any
-- hour_ledger admin insert (e.g. grantMinutes) were broken under RLS.

-- bookings: admin can view/update/cancel any booking
drop policy if exists admin_full_access_bookings on public.bookings;
create policy admin_full_access_bookings on public.bookings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- services: admin can create/edit/deactivate services
drop policy if exists admin_full_access_services on public.services;
create policy admin_full_access_services on public.services
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- plans: admin can create/edit/deactivate pricing plans
drop policy if exists admin_full_access_plans on public.plans;
create policy admin_full_access_plans on public.plans
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- profiles: admin can view all profiles and change roles. Scoped to
-- SELECT/UPDATE only (not DELETE/INSERT) since profile rows are owned by
-- the auth.users trigger, not created/removed by hand.
drop policy if exists admin_read_profiles on public.profiles;
create policy admin_read_profiles on public.profiles
  for select
  using (public.is_admin());

drop policy if exists admin_update_profiles on public.profiles;
create policy admin_update_profiles on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- hour_ledger: admin can view everyone's ledger (to show balances in the
-- users list) and insert manual adjustments (e.g. goodwill credits).
-- No update/delete: the ledger is append-only by design.
drop policy if exists admin_read_hour_ledger on public.hour_ledger;
create policy admin_read_hour_ledger on public.hour_ledger
  for select
  using (public.is_admin());

drop policy if exists admin_insert_hour_ledger on public.hour_ledger;
create policy admin_insert_hour_ledger on public.hour_ledger
  for insert
  with check (public.is_admin());

-- hour_holds: admin can view active holds (available_balances aggregates
-- both hour_ledger and hour_holds -- without this, the admin users page
-- would silently show wrong balances for anyone but the admin themself).
drop policy if exists admin_read_hour_holds on public.hour_holds;
create policy admin_read_hour_holds on public.hour_holds
  for select
  using (public.is_admin());

-- =====================================================================
-- cancel_booking: extend with the same admin bypass complete_booking
-- already has. The original only matched `user_id = auth.uid()`, so an
-- admin calling it on a customer's behalf would just get "Booking not
-- found" instead of actually cancelling anything.
-- =====================================================================
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking record;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select (role = 'admin') into v_is_admin from public.profiles where id = v_user;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if not coalesce(v_is_admin, false) and v_booking.user_id is distinct from v_user then
    raise exception 'Not authorised to cancel this booking' using errcode = '42501';
  end if;

  if v_booking.status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be cancelled';
  end if;

  update public.bookings set status = 'cancelled', updated_at = now()
  where id = p_booking_id;

  update public.hour_holds
  set status = 'released', settled_at = now()
  where booking_id = p_booking_id and status = 'active';
end;
$$;

revoke all on function public.cancel_booking(uuid) from anon, public;
grant execute on function public.cancel_booking(uuid) to authenticated;
