-- claim_booking() and the open-jobs policy previously only checked service_slugs,
-- so a provider could see and claim jobs anywhere, any time, regardless of the
-- service_areas / provider_availability / provider_blackouts already on their
-- profile. This adds a shared provider_can_serve_booking() check (service +
-- Canadian FSA service area + weekly availability window + no blackout overlap)
-- used by both the RLS policy and claim_booking, so they can't diverge.
--
-- Also adds a trigger to keep providers.rating in sync with public.reviews,
-- since nothing wrote to that column before.

create or replace function public.refresh_provider_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_provider_id uuid;
begin
  v_provider_id := coalesce(new.provider_id, old.provider_id);
  if v_provider_id is null then
    return coalesce(new, old);
  end if;

  update public.providers
  set rating = (
    select round(avg(rating)::numeric, 2)
    from public.reviews
    where provider_id = v_provider_id
  )
  where id = v_provider_id;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists reviews_refresh_provider_rating on public.reviews;
create trigger reviews_refresh_provider_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_provider_rating();

create or replace function public.provider_can_serve_booking(p_provider_id uuid, p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if v_provider.id is null or not v_provider.is_active then
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
$function$;

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
  if not v_provider.is_active then
    raise exception 'Your provider profile is not active';
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
$function$;

revoke all on function public.claim_booking(uuid) from public, anon;
grant execute on function public.claim_booking(uuid) to authenticated;
revoke all on function public.provider_can_serve_booking(uuid, uuid) from public, anon;
grant execute on function public.provider_can_serve_booking(uuid, uuid) to authenticated;
