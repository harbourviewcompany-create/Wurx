-- Phase 2 provider ops:
-- 1. Allow self-signup applications to land as verification = 'pending'
--    (was locked to 'unverified' only, so admin had no clear review queue).
-- 2. On new booking INSERT, notify every matching dispatchable provider so
--    they see the job without polling the open-jobs list.

-- ---------- 1. Application status ----------
drop policy if exists providers_insert_own on public.providers;
create policy providers_insert_own on public.providers
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_active = false
    and verification in ('unverified', 'pending')
  );

-- ---------- 2. Notify matching providers when a booking is requested ----------
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
  r record;
begin
  select name into v_service from public.services where id = new.service_id;
  v_when := to_char(new.scheduled_start at time zone 'America/Toronto', 'Mon DD at FMHH12:MIam');

  if tg_op = 'INSERT' then
    perform public.notify_user(
      new.user_id, 'booking_requested',
      format('%s booked for %s', coalesce(v_service, 'Service'), v_when),
      'We are matching you with a local pro. You will be notified when it is confirmed.',
      new.id);

    -- Fan out to every provider who can currently serve this booking.
    -- Uses provider_can_serve_booking so the eligibility bar matches claim_booking.
    for r in
      select p.user_id
      from public.providers p
      where p.is_active
        and p.verification = 'verified'
        and public.provider_can_serve_booking(p.id, new.id)
    loop
      perform public.notify_user(
        r.user_id,
        'job_available',
        format('New job: %s on %s', coalesce(v_service, 'Service'), v_when),
        'Open your provider dashboard to claim it. First to claim gets it.',
        new.id);
    end loop;

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
