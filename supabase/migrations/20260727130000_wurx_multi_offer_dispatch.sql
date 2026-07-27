-- Multi-offer dispatch:
-- When a booking is requested, create job_offers (status=offered) for every
-- matching provider. Providers accept or decline; first accept wins and
-- withdraws sibling offers. claim_booking remains as a fallback for any
-- booking still open without a formal offer row for that provider.

-- ---------- dispatch ----------
create or replace function public.dispatch_booking_offers(p_booking_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking record;
  v_service text;
  v_when text;
  v_ttl int;
  v_count int := 0;
  r record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'requested' or v_booking.provider_id is not null then
    return 0;
  end if;

  select name into v_service from public.services where id = v_booking.service_id;
  v_when := to_char(v_booking.scheduled_start at time zone 'America/Toronto', 'Mon DD at FMHH12:MIam');
  v_ttl := public.get_setting_int('offer_ttl_minutes', 30);

  for r in
    select p.id as provider_id, p.user_id
    from public.providers p
    where p.is_active
      and p.verification = 'verified'
      and public.provider_can_serve_booking(p.id, p_booking_id)
  loop
    insert into public.job_offers (booking_id, provider_id, status, offered_at, expires_at)
    values (
      p_booking_id,
      r.provider_id,
      'offered',
      now(),
      now() + make_interval(mins => v_ttl)
    )
    on conflict (booking_id, provider_id) do nothing;

    if found then
      v_count := v_count + 1;
      perform public.notify_user(
        r.user_id,
        'job_offer',
        format('Job offer: %s on %s', coalesce(v_service, 'Service'), v_when),
        format('You have %s minutes to accept or decline.', v_ttl),
        p_booking_id
      );
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.dispatch_booking_offers(uuid) from public, anon;
grant execute on function public.dispatch_booking_offers(uuid) to authenticated;

-- ---------- respond (accept / decline) ----------
create or replace function public.respond_to_offer(p_offer_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_provider record;
  v_booking record;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if v_offer.id is null then
    raise exception 'Offer not found';
  end if;

  select * into v_provider from public.providers where id = v_offer.provider_id;
  if v_provider.id is null or v_provider.user_id is distinct from v_user then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'This offer is no longer open';
  end if;

  if v_offer.expires_at < now() then
    update public.job_offers
    set status = 'expired', responded_at = now()
    where id = p_offer_id;
    raise exception 'This offer has expired';
  end if;

  if not p_accept then
    update public.job_offers
    set status = 'declined', responded_at = now()
    where id = p_offer_id;
    return;
  end if;

  -- Accept path: re-check eligibility and lock the booking.
  if not v_provider.is_active or v_provider.verification <> 'verified' then
    raise exception 'Your provider profile is not verified yet';
  end if;

  select b.* into v_booking from public.bookings b where b.id = v_offer.booking_id for update of b;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'requested' or v_booking.provider_id is not null then
    update public.job_offers
    set status = 'withdrawn', responded_at = now()
    where id = p_offer_id;
    raise exception 'This booking is no longer available';
  end if;

  if not public.provider_can_serve_booking(v_provider.id, v_booking.id) then
    raise exception 'This job is outside the services, area, or availability on your profile';
  end if;

  update public.bookings
  set provider_id = v_provider.id, status = 'confirmed', updated_at = now()
  where id = v_booking.id;

  update public.job_offers
  set status = 'accepted', responded_at = now()
  where id = p_offer_id;

  -- Withdraw every other open offer on this booking.
  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = v_booking.id
    and id <> p_offer_id
    and status = 'offered';
end;
$function$;

revoke all on function public.respond_to_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_to_offer(uuid, boolean) to authenticated;

-- ---------- claim_booking: also withdraw sibling offers ----------
create or replace function public.claim_booking(p_booking_id uuid)
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

  -- Prefer upgrading an existing open offer; otherwise insert accepted.
  update public.job_offers
  set status = 'accepted', responded_at = now()
  where booking_id = p_booking_id
    and provider_id = v_provider.id
    and status = 'offered';

  if not found then
    insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
    values (p_booking_id, v_provider.id, 'accepted', now(), now())
    on conflict (booking_id, provider_id) do update
      set status = 'accepted', responded_at = now();
  end if;

  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = p_booking_id
    and provider_id is distinct from v_provider.id
    and status = 'offered';
end;
$function$;

revoke all on function public.claim_booking(uuid) from public, anon;
grant execute on function public.claim_booking(uuid) to authenticated;

-- ---------- admin assign: withdraw open offers too ----------
create or replace function public.admin_assign_booking(
  p_booking_id uuid,
  p_provider_id uuid,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  update public.job_offers
  set status = 'withdrawn', responded_at = now()
  where booking_id = p_booking_id and status in ('offered', 'accepted');

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, p_provider_id, 'accepted', now(), now())
  on conflict (booking_id, provider_id) do update
    set status = 'accepted', responded_at = now();
end;
$function$;

-- ---------- booking trigger: auto-dispatch offers on insert ----------
create or replace function public.on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text;
  v_provider_user uuid;
  v_when text;
begin
  select name into v_service from public.services where id = new.service_id;
  v_when := to_char(new.scheduled_start at time zone 'America/Toronto', 'Mon DD at FMHH12:MIam');

  if tg_op = 'INSERT' then
    perform public.notify_user(
      new.user_id, 'booking_requested',
      format('%s booked for %s', coalesce(v_service, 'Service'), v_when),
      'We are matching you with a local pro. You will be notified when it is confirmed.',
      new.id);

    -- Create formal offers + notify matching providers.
    perform public.dispatch_booking_offers(new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.provider_id is not null then
      select user_id into v_provider_user from public.providers where id = new.provider_id;
    end if;

    if new.status = 'confirmed' then
      perform public.notify_user(
        new.user_id, 'booking_confirmed',
        format('%s is confirmed for %s', coalesce(v_service, 'Your service'), v_when),
        'A vetted pro has accepted the job.', new.id);
      perform public.notify_user(
        v_provider_user, 'job_accepted',
        format('You accepted %s on %s', coalesce(v_service, 'a job'), v_when),
        'The customer has been notified.', new.id);

    elsif new.status = 'completed' then
      perform public.notify_user(
        new.user_id, 'booking_completed',
        format('%s is complete', coalesce(v_service, 'Your service')),
        'Minutes have been deducted from your plan. Leave a review to help other homeowners.',
        new.id);
      perform public.notify_user(
        v_provider_user, 'job_completed',
        'Job marked complete', 'Your earnings have been recorded.', new.id);

    elsif new.status = 'cancelled' then
      -- Withdraw any still-open offers so they leave the provider queue.
      update public.job_offers
      set status = 'withdrawn', responded_at = now()
      where booking_id = new.id and status = 'offered';

      perform public.notify_user(
        new.user_id, 'booking_cancelled',
        format('%s was cancelled', coalesce(v_service, 'Your booking')),
        'Any held minutes have been returned to your balance.', new.id);
      perform public.notify_user(
        v_provider_user, 'job_cancelled',
        'A job you accepted was cancelled', null, new.id);
    end if;
  end if;

  return new;
end;
$$;

-- Admin may re-dispatch offers on an open booking (e.g. after new providers join).
create or replace function public.admin_redispatch_booking(p_booking_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.dispatch_booking_offers(p_booking_id);
end;
$function$;

revoke all on function public.admin_redispatch_booking(uuid) from public, anon;
grant execute on function public.admin_redispatch_booking(uuid) to authenticated;
