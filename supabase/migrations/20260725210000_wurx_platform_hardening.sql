-- Platform hardening: lock down accidental RPC exposure, stop minutes leaking
-- into abandoned bookings, make the platform fee configurable, and add a
-- notification spine so the service loop doesn't depend on people refreshing.

-- =====================================================================
-- 1. Trigger functions are not API endpoints.
--
-- Supabase default-grants EXECUTE on new public functions to anon and
-- authenticated, which exposed our trigger functions and is_admin() at
-- /rest/v1/rpc/*. Trigger functions error outside trigger context so the
-- exploitability is low, but they should never have been reachable.
-- =====================================================================
revoke all on function public.guard_profile_role_change() from anon, authenticated, public;
revoke all on function public.guard_provider_privileged_columns() from anon, authenticated, public;
revoke all on function public.refresh_provider_rating() from anon, authenticated, public;

-- is_admin() is used inside policies (which run as the policy owner), so it
-- does not need to be callable over REST.
revoke all on function public.is_admin() from anon, authenticated, public;

-- Eligibility is likewise only consumed by policies/RPCs internally.
revoke all on function public.provider_can_serve_booking(uuid, uuid) from anon, public;

-- =====================================================================
-- 2. Configurable platform economics.
--
-- complete_booking() hardcoded a 20% platform fee. Rates are a business
-- decision that should not require a code deploy.
-- =====================================================================
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.app_settings (key, value, description)
values
  ('platform_fee_bps', '2000'::jsonb, 'Platform commission in basis points (2000 = 20%)'),
  ('offer_ttl_minutes', '30'::jsonb, 'How long a dispatched job offer stays open')
on conflict (key) do nothing;

create or replace function public.get_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

revoke all on function public.get_setting_int(text, int) from anon, authenticated, public;

-- =====================================================================
-- 3. Notifications spine.
--
-- Nothing told anyone anything: a customer booked and the pro never knew, a
-- pro claimed a job and the customer never knew. Rows are written by
-- SECURITY DEFINER triggers only; users can read and mark their own read.
-- An edge function drains `email_pending` for outbound delivery.
-- =====================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  booking_id uuid references public.bookings(id) on delete set null,
  read_at timestamptz,
  email_pending boolean not null default true,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_email_queue_idx
  on public.notifications (created_at) where email_pending;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (auth.uid() = user_id);

-- Users may only ever mark their own notification read; the row is otherwise
-- immutable from the client.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_booking_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, booking_id)
  values (p_user_id, p_kind, p_title, p_body, p_booking_id);
end;
$$;

revoke all on function public.notify_user(uuid, text, text, text, uuid) from anon, authenticated, public;

-- Booking lifecycle -> notifications for both sides.
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

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify
  after insert or update on public.bookings
  for each row execute function public.on_booking_change();

-- =====================================================================
-- 4. Reclaim minutes from abandoned bookings.
--
-- A booking nobody claimed sat as 'requested' forever, holding the customer's
-- minutes hostage — real money silently stuck. Cancel anything whose start
-- time has passed while still unclaimed, releasing the hold.
-- =====================================================================
create or replace function public.expire_abandoned_bookings()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  with stale as (
    select id from public.bookings
    where status = 'requested'
      and provider_id is null
      and scheduled_start < now()
    for update skip locked
  ), cancelled as (
    update public.bookings b
    set status = 'cancelled', updated_at = now()
    from stale s where b.id = s.id
    returning b.id
  ), released as (
    update public.hour_holds h
    set status = 'released', settled_at = now()
    from cancelled c
    where h.booking_id = c.id and h.status = 'active'
    returning h.id
  )
  select count(*) into v_count from cancelled;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_abandoned_bookings() from anon, authenticated, public;

create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.job_offers
  set status = 'expired', responded_at = now()
  where status = 'offered' and expires_at < now();
  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_stale_offers() from anon, authenticated, public;

-- =====================================================================
-- 5. Schedule the housekeeping.
-- =====================================================================
create extension if not exists pg_cron;

select cron.unschedule('wurx-expire-offers')
  where exists (select 1 from cron.job where jobname = 'wurx-expire-offers');
select cron.unschedule('wurx-expire-bookings')
  where exists (select 1 from cron.job where jobname = 'wurx-expire-bookings');

select cron.schedule('wurx-expire-offers', '*/5 * * * *',
  $cron$select public.expire_stale_offers();$cron$);
select cron.schedule('wurx-expire-bookings', '*/15 * * * *',
  $cron$select public.expire_abandoned_bookings();$cron$);

-- =====================================================================
-- 6. complete_booking: fix a lock that made it impossible to call, and read
--    the platform fee from app_settings.
--
--    It locked with `FOR UPDATE` over a LEFT JOIN, which Postgres rejects
--    ("FOR UPDATE cannot be applied to the nullable side of an outer join"),
--    so EVERY call raised — no booking could be completed, no minutes
--    consumed, no provider earnings recorded. Invisible until now only
--    because no booking had ever reached completion. Lock the bookings row
--    only (`for update of b`).
-- =====================================================================
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
  for update of b;

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
