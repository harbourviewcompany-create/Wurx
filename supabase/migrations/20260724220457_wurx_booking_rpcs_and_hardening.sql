-- Wurx: booking lifecycle RPCs + security/performance hardening

create or replace function public.request_booking(
  p_service_id uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes int,
  p_address_line1 text,
  p_city text,
  p_postal_code text,
  p_notes text
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
    user_id, service_id, status, scheduled_start, duration_minutes,
    address_line1, city, postal_code, notes
  ) values (
    v_user, p_service_id, 'requested', p_scheduled_start, p_duration_minutes,
    nullif(p_address_line1, ''), nullif(p_city, ''), nullif(p_postal_code, ''),
    nullif(p_notes, '')
  ) returning id into v_booking_id;

  insert into public.hour_holds (user_id, booking_id, hold_minutes, status)
  values (v_user, v_booking_id, v_required, 'active');

  return v_booking_id;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status public.booking_status;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select status into v_status
  from public.bookings
  where id = p_booking_id and user_id = v_user
  for update;

  if v_status is null then
    raise exception 'Booking not found';
  end if;

  if v_status not in ('requested', 'confirmed') then
    raise exception 'Only upcoming bookings can be cancelled';
  end if;

  update public.bookings set status = 'cancelled', updated_at = now()
  where id = p_booking_id;

  update public.hour_holds
  set status = 'released', settled_at = now()
  where booking_id = p_booking_id and status = 'active';
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking record;
  v_hold record;
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
end;
$$;

revoke all on function public.request_booking(uuid, timestamptz, int, text, text, text, text) from public;
revoke all on function public.cancel_booking(uuid) from public;
revoke all on function public.complete_booking(uuid) from public;
grant execute on function public.request_booking(uuid, timestamptz, int, text, text, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;

create index if not exists bookings_service_id_idx on public.bookings (service_id);
create index if not exists hour_ledger_booking_id_idx on public.hour_ledger (booking_id);
create index if not exists hour_ledger_subscription_id_idx on public.hour_ledger (subscription_id);
create index if not exists provider_earnings_booking_id_idx on public.provider_earnings (booking_id);
create index if not exists reviews_author_id_idx on public.reviews (author_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);

drop policy if exists availability_write_own on public.provider_availability;

create policy availability_insert_own on public.provider_availability
  for insert to authenticated
  with check (provider_id in (
    select id from public.providers where user_id = (select auth.uid())
  ));

create policy availability_update_own on public.provider_availability
  for update to authenticated
  using (provider_id in (
    select id from public.providers where user_id = (select auth.uid())
  ))
  with check (provider_id in (
    select id from public.providers where user_id = (select auth.uid())
  ));

create policy availability_delete_own on public.provider_availability
  for delete to authenticated
  using (provider_id in (
    select id from public.providers where user_id = (select auth.uid())
  ));

drop policy if exists allow_anon_insert on public.wurx_ottawa_leads;

create policy allow_anon_insert on public.wurx_ottawa_leads
  for insert to anon
  with check (
    char_length(name) between 1 and 200
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and char_length(coalesce(message, '')) <= 2000
  );
