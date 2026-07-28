-- Provider marks a confirmed job as in progress (on the way / on site).
-- Notifies the customer. Does not touch hour_holds.

create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking record;
  v_provider_name text;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select (role = 'admin') into v_is_admin from public.profiles where id = v_user;

  select b.*, p.user_id as provider_user_id, p.business_name
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
    raise exception 'Not authorised to start this booking' using errcode = '42501';
  end if;

  if v_booking.status = 'in_progress' then
    return;
  end if;

  if v_booking.status is distinct from 'confirmed' then
    raise exception 'Only a confirmed booking can be started';
  end if;

  update public.bookings
  set status = 'in_progress', updated_at = now()
  where id = p_booking_id;

  v_provider_name := coalesce(v_booking.business_name, 'Your pro');

  perform public.notify_user(
    v_booking.user_id,
    'booking_started',
    v_provider_name || ' is on the job',
    'Your pro marked this booking as in progress. They are on the way or already on site.',
    p_booking_id
  );
end;
$function$;

revoke all on function public.start_booking(uuid) from public, anon;
grant execute on function public.start_booking(uuid) to authenticated;
