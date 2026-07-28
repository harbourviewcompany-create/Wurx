-- Wurx: let a provider back out of a job they already accepted.
--
-- Once a booking is confirmed there was no self-service way to undo that --
-- only admin_unassign_booking/admin_cancel_booking. A provider who accepted
-- and then can't make it had no path but contacting support, leaving the
-- customer's job stuck. This unassigns the booking (back to 'requested'),
-- notifies the customer, and re-runs dispatch so other eligible providers
-- get a fresh shot at it. Doesn't touch hour_holds -- the job is still
-- happening, just with a different provider, so the customer's held minutes
-- stay exactly where they were.

create or replace function public.release_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.provider_id is distinct from v_provider.id then
    raise exception 'This booking is not assigned to you';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'This booking can no longer be released';
  end if;

  update public.bookings
  set provider_id = null, status = 'requested', updated_at = now()
  where id = p_booking_id;

  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = p_booking_id and status = 'offered';

  perform public.notify_user(
    v_booking.user_id,
    'booking_released',
    'Your provider had to step back',
    'We are finding a new match for your booking. No action needed from you.',
    p_booking_id
  );

  perform public.dispatch_booking_offers(p_booking_id);
end;
$function$;

revoke all on function public.release_booking(uuid) from public, anon;
grant execute on function public.release_booking(uuid) to authenticated;
