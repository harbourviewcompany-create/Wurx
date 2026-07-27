revoke all on function public.guard_profile_role_change() from anon, authenticated, public;
revoke all on function public.guard_provider_privileged_columns() from anon, authenticated, public;
revoke all on function public.refresh_provider_rating() from anon, authenticated, public;
revoke all on function public.is_admin() from anon, authenticated, public;
revoke all on function public.provider_can_serve_booking(uuid, uuid) from anon, public;

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
