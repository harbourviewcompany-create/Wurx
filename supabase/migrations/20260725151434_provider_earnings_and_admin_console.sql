-- 1. complete_booking never credited the provider anything, despite
-- services.provider_rate_cents_per_hour existing precisely for this and
-- provider_earnings having zero rows. Platform fee is a placeholder 20% —
-- an actual business decision, not something to leave silently undocumented.
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking record;
  v_hold record;
  v_rate_cents_per_hour int;
  v_gross_cents int;
  v_fee_cents int;
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
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if not coalesce(v_is_admin, false)
     and v_booking.provider_user_id is distinct from v_user then
    raise exception 'Not authorised to complete this booking' using errcode = '42501';
  end if;

  if v_booking.status = 'completed' then
    return;
  end if;

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
      v_gross_cents := round(v_booking.duration_minutes / 60.0 * v_rate_cents_per_hour);
      v_fee_cents := round(v_gross_cents * 0.20);

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

-- 2. Admin visibility: profiles.role='admin' exists but nothing granted admins
-- read access beyond their own rows.
create policy providers_select_admin on public.providers
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy bookings_select_admin on public.bookings
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3. Admin actions: verify/activate providers, and a manual-assign / cancel
-- fallback for bookings stuck unclaimed (no dispatch UI exists yet).
create or replace function public.admin_set_provider_status(
  p_provider_id uuid,
  p_verification public.verification_status,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
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
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
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
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be cancelled';
  end if;

  update public.bookings set status = 'cancelled', updated_at = now() where id = p_booking_id;

  update public.hour_holds
  set status = 'released', settled_at = now()
  where booking_id = p_booking_id and status = 'active';
end;
$function$;

revoke all on function public.admin_set_provider_status(uuid, public.verification_status, boolean) from public, anon;
grant execute on function public.admin_set_provider_status(uuid, public.verification_status, boolean) to authenticated;
revoke all on function public.admin_assign_booking(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_booking(uuid, uuid) to authenticated;
revoke all on function public.admin_cancel_booking(uuid) from public, anon;
grant execute on function public.admin_cancel_booking(uuid) to authenticated;

alter table public.provider_earnings add constraint provider_earnings_booking_id_unique unique (booking_id);
