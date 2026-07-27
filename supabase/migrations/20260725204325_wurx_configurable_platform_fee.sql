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
