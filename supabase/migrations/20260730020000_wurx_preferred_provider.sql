-- Rebook the same pro.
--
-- A customer who liked a provider had no way to get them again: "Book again"
-- only carried service + duration, and every booking fanned out to all matching
-- pros on a first-accept-wins basis. This lets the customer request a provider
-- they have already worked with, and gives that provider an exclusive
-- first-refusal window before the job opens to everyone.
--
-- The fan-out fallback is derived from job_offers rather than a new flag
-- column: a booking is due for fan-out when its only offers belong to the
-- preferred provider and that offer is no longer open. Once fan-out happens,
-- offers exist for other providers, so the condition can never fire twice.

alter table public.bookings
  add column if not exists preferred_provider_id uuid
    references public.providers(id) on delete set null;

comment on column public.bookings.preferred_provider_id is
  'Provider the customer asked for. Receives an exclusive offer for '
  'preferred_offer_ttl_minutes before the booking fans out to all matching pros.';

create index if not exists bookings_preferred_provider_idx
  on public.bookings (preferred_provider_id)
  where preferred_provider_id is not null;

-- ---------- request_booking: accept a preferred provider ----------
-- Adding an argument creates a NEW function identity rather than replacing the
-- old one, so drop the 8-arg signature explicitly. Leaving it in place would let
-- a future 8-arg caller silently skip the preferred provider -- the same trap
-- 20260728183516_wurx_drop_stale_request_booking_overload.sql was written for.
drop function if exists public.request_booking(
  uuid, timestamptz, int, text, text, text, text, timestamptz);

create or replace function public.request_booking(
  p_service_id uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes int,
  p_address_line1 text,
  p_city text,
  p_postal_code text,
  p_notes text,
  p_window_end timestamptz default null,
  p_preferred_provider_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_multiplier numeric;
  v_required int;
  v_settled int;
  v_held int;
  v_available int;
  v_booking_id uuid;
  v_window_end timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 30 then
    raise exception 'Duration must be at least 30 minutes';
  end if;

  if p_scheduled_start is null or p_scheduled_start <= now() then
    raise exception 'Scheduled time must be in the future';
  end if;

  v_window_end := coalesce(p_window_end, p_scheduled_start + interval '2 hours');
  if v_window_end <= p_scheduled_start then
    raise exception 'Window end must be after the window start';
  end if;

  -- Only a pro this customer has actually completed a job with may be
  -- requested. Without this, the RPC would let anyone aim a booking at any
  -- verified provider. Eligibility for *this* booking (area, availability,
  -- blackouts) is not checked here -- provider_can_serve_booking needs a
  -- booking id, so dispatch handles it, and an ineligible favourite degrades
  -- to a normal fan-out instead of an error.
  if p_preferred_provider_id is not null and not exists (
    select 1
    from public.bookings b
    join public.providers p on p.id = b.provider_id
    where b.user_id = v_user
      and b.status = 'completed'
      and b.provider_id = p_preferred_provider_id
      and p.is_active
      and p.verification = 'verified'
  ) then
    raise exception 'You can only request a pro you have worked with before';
  end if;

  select credit_multiplier into v_multiplier
  from public.services
  where id = p_service_id and is_active = true;

  if v_multiplier is null then
    raise exception 'Unknown or inactive service';
  end if;

  v_required := ceil(p_duration_minutes * v_multiplier);

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select coalesce(sum(delta_minutes), 0) into v_settled
  from public.hour_ledger where user_id = v_user;

  select coalesce(sum(hold_minutes), 0) into v_held
  from public.hour_holds where user_id = v_user and status = 'active';

  v_available := v_settled - v_held;

  if v_required > v_available then
    raise exception 'Insufficient minutes: booking needs %, you have %',
      v_required, v_available;
  end if;

  insert into public.bookings (
    user_id, service_id, status, scheduled_start, window_end, duration_minutes,
    address_line1, city, postal_code, notes, preferred_provider_id
  ) values (
    v_user, p_service_id, 'requested', p_scheduled_start, v_window_end, p_duration_minutes,
    nullif(p_address_line1, ''), nullif(p_city, ''), nullif(p_postal_code, ''),
    nullif(p_notes, ''), p_preferred_provider_id
  ) returning id into v_booking_id;

  insert into public.hour_holds (user_id, booking_id, hold_minutes, status)
  values (v_user, v_booking_id, v_required, 'active');

  return v_booking_id;
end;
$$;

revoke all on function public.request_booking(
  uuid, timestamptz, int, text, text, text, text, timestamptz, uuid)
  from public, anon;
grant execute on function public.request_booking(
  uuid, timestamptz, int, text, text, text, text, timestamptz, uuid)
  to authenticated;

-- ---------- dispatch: exclusive first refusal, then the usual fan-out ----------
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
  v_preferred_user uuid;
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

  -- First refusal. Only on the very first dispatch for this booking: once any
  -- offer exists we are in (or past) the fan-out, and the branch must not fire
  -- again. An ineligible favourite falls through to the fan-out below rather
  -- than stranding the job.
  if v_booking.preferred_provider_id is not null
     and not exists (select 1 from public.job_offers where booking_id = p_booking_id)
     and public.provider_can_serve_booking(v_booking.preferred_provider_id, p_booking_id)
  then
    v_ttl := public.get_setting_int('preferred_offer_ttl_minutes', 10);

    insert into public.job_offers (booking_id, provider_id, status, offered_at, expires_at)
    values (
      p_booking_id,
      v_booking.preferred_provider_id,
      'offered',
      now(),
      now() + make_interval(mins => v_ttl)
    );

    select user_id into v_preferred_user
    from public.providers where id = v_booking.preferred_provider_id;

    -- Deliberately anonymous, matching the ordinary job_offer notification:
    -- no customer name or address goes out before someone accepts.
    perform public.notify_user(
      v_preferred_user,
      'job_offer',
      format('Requested for you: %s on %s', coalesce(v_service, 'Service'), v_when),
      format(
        'A repeat customer asked for you specifically. You have %s minutes before this opens to other pros.',
        v_ttl
      ),
      p_booking_id
    );

    return 1;
  end if;

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

    -- Skips the pro who already passed on the exclusive offer: their row
    -- conflicts, so nothing is inserted and no second notification goes out.
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

revoke all on function public.dispatch_booking_offers(uuid) from public, anon, authenticated;

-- ---------- hold the window against the open-jobs path ----------
-- A booking in its first-refusal window still looks like any unclaimed job:
-- status 'requested', provider_id null. Without this, every matching pro would
-- see it in their open-jobs list and claim_booking would hand it to whoever
-- tapped first -- so the "exclusive" offer would be exclusive in name only.
--
-- SECURITY DEFINER because this is used inside a bookings RLS policy and reads
-- bookings; running it as the caller would re-enter that policy. Same reason
-- provider_can_serve_booking is defined that way.
create or replace function public.booking_reserved_for_other(
  p_booking_id uuid,
  p_provider_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.bookings b
    join public.job_offers o
      on o.booking_id = b.id
     and o.provider_id = b.preferred_provider_id
    where b.id = p_booking_id
      and b.preferred_provider_id is not null
      and b.preferred_provider_id is distinct from p_provider_id
      and o.status = 'offered'
      and o.expires_at > now()
  );
$$;

revoke all on function public.booking_reserved_for_other(uuid, uuid) from public, anon;
grant execute on function public.booking_reserved_for_other(uuid, uuid) to authenticated;

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
        and not public.booking_reserved_for_other(bookings.id, p.id)
    )
  );

-- ---------- claim_booking: cannot cut ahead of a first-refusal window ----------
-- RLS hides the job, but claim_booking is security definer and takes a booking
-- id directly, so the check has to live here too.
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

  if public.booking_reserved_for_other(p_booking_id, v_provider.id) then
    raise exception 'The customer asked for a specific pro on this job. It opens up shortly if they pass';
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

-- ---------- respond_to_offer: a pass by the favourite opens the job at once ----------
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
  v_preferred uuid;
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

    -- If this was the requested pro, their pass ends the exclusive window now.
    -- Waiting for the 5-minute expiry sweep would cost the customer time for
    -- no reason, since the answer is already in.
    select b.preferred_provider_id into v_preferred
    from public.bookings b where b.id = v_offer.booking_id;

    if v_preferred is not null and v_preferred = v_offer.provider_id then
      perform public.dispatch_booking_offers(v_offer.booking_id);
    end if;

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

-- ---------- expiry sweep: fan out first-refusal windows that lapsed ----------
create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
  r record;
begin
  update public.job_offers
  set status = 'expired', responded_at = now()
  where status = 'offered' and expires_at < now();
  get diagnostics v_count = row_count;

  -- A first-refusal window that lapsed unanswered: open the booking to every
  -- matching pro. "No offers for anyone but the favourite" is what makes this
  -- idempotent -- after fan-out those rows exist and the condition stops
  -- matching, so a booking is never dispatched twice.
  for r in
    select b.id
    from public.bookings b
    where b.status = 'requested'
      and b.provider_id is null
      and b.preferred_provider_id is not null
      and not exists (
        select 1 from public.job_offers o
        where o.booking_id = b.id
          and o.provider_id <> b.preferred_provider_id
      )
      and exists (
        select 1 from public.job_offers o
        where o.booking_id = b.id
          and o.provider_id = b.preferred_provider_id
          and o.status in ('declined', 'expired', 'withdrawn')
      )
  loop
    perform public.dispatch_booking_offers(r.id);
  end loop;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_stale_offers() from anon, authenticated, public;

-- ---------- on_booking_change: tell the customer who we asked ----------
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
  v_requested_body text;
begin
  select name into v_service from public.services where id = new.service_id;
  v_when := to_char(new.scheduled_start at time zone 'America/Toronto', 'Mon DD at FMHH12:MIam');

  if tg_op = 'INSERT' then
    -- Without this the feature is invisible until the booking confirms: the
    -- customer picked a pro and then saw the same generic "matching you" copy.
    -- Falls back to the generic line when the pro has no business name.
    if new.preferred_provider_id is not null then
      select 'We asked ' || p.business_name
             || ' first. If they are not free, we will match you with another vetted pro.'
        into v_requested_body
      from public.providers p
      where p.id = new.preferred_provider_id;
    end if;

    perform public.notify_user(
      new.user_id, 'booking_requested',
      format('%s booked for %s', coalesce(v_service, 'Service'), v_when),
      coalesce(
        v_requested_body,
        'We are matching you with a local pro. You will be notified when it is confirmed.'
      ),
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
