-- Market-leading customer ops: arrival windows, completion photos, SMS queue,
-- clearer "pro en route" notifications.

-- Arrival window end (start remains scheduled_start). UI books 2h windows.
alter table public.bookings
  add column if not exists window_end timestamptz;

comment on column public.bookings.window_end is
  'Exclusive end of guaranteed arrival window; null = point-in-time start.';

-- Completion photos (paths in Storage bucket job-photos)
create table if not exists public.booking_photos (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption     text,
  created_at  timestamptz not null default now()
);
create index if not exists booking_photos_booking_idx on public.booking_photos (booking_id);

alter table public.booking_photos enable row level security;

drop policy if exists booking_photos_select on public.booking_photos;
create policy booking_photos_select on public.booking_photos
  for select to authenticated using (
    booking_id in (
      select id from public.bookings
      where user_id = (select auth.uid())
         or provider_id in (select id from public.providers where user_id = (select auth.uid()))
    )
    or exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

drop policy if exists booking_photos_insert on public.booking_photos;
create policy booking_photos_insert on public.booking_photos
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and booking_id in (
      select b.id from public.bookings b
      left join public.providers p on p.id = b.provider_id
      where b.user_id = (select auth.uid()) or p.user_id = (select auth.uid())
    )
  );

grant select, insert on public.booking_photos to authenticated;

-- SMS drain flag (mirrors email_pending)
alter table public.notifications
  add column if not exists sms_pending boolean not null default false;
alter table public.notifications
  add column if not exists sms_sent_at timestamptz;

-- Status transitions that should wake the customer off-app
create or replace function public.notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_booking_id uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sms boolean := p_kind in (
    'booking_started', 'booking_confirmed', 'booking_completed', 'offer_accepted'
  );
begin
  insert into public.notifications (user_id, kind, title, body, booking_id, email_pending, sms_pending)
  values (p_user_id, p_kind, p_title, p_body, p_booking_id, true, v_sms);
end;
$function$;

-- Clearer customer-facing "pro en route" copy
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
    v_provider_name || ' is on the way',
    'Your pro is en route. Open Wurx for the job address map and status.',
    p_booking_id
  );
end;
$function$;

-- Optional window_end on request
create or replace function public.request_booking(
  p_service_id uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes int,
  p_address_line1 text,
  p_city text,
  p_postal_code text,
  p_notes text,
  p_window_end timestamptz default null
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
    address_line1, city, postal_code, notes
  ) values (
    v_user, p_service_id, 'requested', p_scheduled_start, v_window_end, p_duration_minutes,
    nullif(p_address_line1, ''), nullif(p_city, ''), nullif(p_postal_code, ''),
    nullif(p_notes, '')
  ) returning id into v_booking_id;

  insert into public.hour_holds (user_id, booking_id, hold_minutes, status)
  values (v_user, v_booking_id, v_required, 'active');

  return v_booking_id;
end;
$$;

revoke all on function public.request_booking(uuid, timestamptz, int, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.request_booking(uuid, timestamptz, int, text, text, text, text, timestamptz) to authenticated;
