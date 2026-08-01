-- Retry-safe, channel-specific notification delivery queue.
--
-- Workers atomically claim rows with FOR UPDATE SKIP LOCKED. Before calling an
-- external provider they persist delivery_started_at. Explicit provider
-- failures are retryable only up to a bounded attempt limit; ambiguous outcomes
-- and stale provider-start crashes enter reconciliation and are never auto-sent.

alter table public.notifications
  add column if not exists email_attempts integer not null default 0,
  add column if not exists email_next_attempt_at timestamptz not null default now(),
  add column if not exists email_claim_token uuid,
  add column if not exists email_claimed_at timestamptz,
  add column if not exists email_delivery_started_at timestamptz,
  add column if not exists email_reconciliation_required boolean not null default false,
  add column if not exists email_last_error text,
  add column if not exists email_provider_message_id text,
  add column if not exists sms_attempts integer not null default 0,
  add column if not exists sms_next_attempt_at timestamptz not null default now(),
  add column if not exists sms_claim_token uuid,
  add column if not exists sms_claimed_at timestamptz,
  add column if not exists sms_delivery_started_at timestamptz,
  add column if not exists sms_reconciliation_required boolean not null default false,
  add column if not exists sms_last_error text,
  add column if not exists sms_provider_message_id text;

alter table public.notifications
  drop constraint if exists notifications_email_attempts_check;
alter table public.notifications
  add constraint notifications_email_attempts_check check (email_attempts >= 0);
alter table public.notifications
  drop constraint if exists notifications_sms_attempts_check;
alter table public.notifications
  add constraint notifications_sms_attempts_check check (sms_attempts >= 0);

create index if not exists notifications_email_delivery_queue_idx
  on public.notifications (email_next_attempt_at, created_at)
  where email_pending and not email_reconciliation_required;
create index if not exists notifications_sms_delivery_queue_idx
  on public.notifications (sms_next_attempt_at, created_at)
  where sms_pending and not sms_reconciliation_required;
create index if not exists notifications_delivery_reconciliation_idx
  on public.notifications (created_at)
  where email_reconciliation_required or sms_reconciliation_required;
create unique index if not exists notifications_email_provider_message_uidx
  on public.notifications (email_provider_message_id)
  where email_provider_message_id is not null;
create unique index if not exists notifications_sms_provider_message_uidx
  on public.notifications (sms_provider_message_id)
  where sms_provider_message_id is not null;

-- A worker can crash after persisting delivery_started_at but before recording a
-- provider response. Such rows cannot be safely resent because the provider may
-- have accepted the request. Move stale starts into operator reconciliation.
create or replace function public.recover_stale_notification_deliveries(
  p_stale_seconds integer default 900
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stale integer := greatest(60, least(coalesce(p_stale_seconds, 900), 86400));
  v_email_count integer := 0;
  v_sms_count integer := 0;
begin
  update public.notifications
  set
    email_claim_token = null,
    email_claimed_at = null,
    email_reconciliation_required = true,
    email_last_error = left(
      coalesce(email_last_error || '; ', '') ||
      'Worker stopped after email delivery began; verify provider outcome before requeue',
      2000
    )
  where email_pending
    and not email_reconciliation_required
    and email_delivery_started_at is not null
    and email_delivery_started_at < now() - make_interval(secs => v_stale);
  get diagnostics v_email_count = row_count;

  update public.notifications
  set
    sms_claim_token = null,
    sms_claimed_at = null,
    sms_reconciliation_required = true,
    sms_last_error = left(
      coalesce(sms_last_error || '; ', '') ||
      'Worker stopped after SMS delivery began; verify provider outcome before requeue',
      2000
    )
  where sms_pending
    and not sms_reconciliation_required
    and sms_delivery_started_at is not null
    and sms_delivery_started_at < now() - make_interval(secs => v_stale);
  get diagnostics v_sms_count = row_count;

  return v_email_count + v_sms_count;
end;
$$;

create or replace function public.claim_notification_deliveries(
  p_channel text,
  p_limit integer,
  p_claim_token uuid
)
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  attempt_count integer,
  delivery_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if p_claim_token is null then
    raise exception 'claim token is required';
  end if;

  if p_channel = 'email' then
    return query
    with candidates as (
      select n.id
      from public.notifications n
      where n.email_pending
        and not n.email_reconciliation_required
        and n.email_delivery_started_at is null
        and n.email_next_attempt_at <= now()
        and (
          n.email_claimed_at is null
          or n.email_claimed_at < now() - interval '15 minutes'
        )
      order by n.created_at, n.id
      for update skip locked
      limit v_limit
    ), claimed as (
      update public.notifications n
      set
        email_claim_token = p_claim_token,
        email_claimed_at = now(),
        email_attempts = n.email_attempts + 1,
        email_last_error = null
      from candidates c
      where n.id = c.id
      returning n.id, n.user_id, n.title, n.body, n.email_attempts
    )
    select c.id, c.user_id, c.title, c.body, c.email_attempts,
      'wurx-email-' || c.id::text
    from claimed c;
    return;
  end if;

  if p_channel = 'sms' then
    return query
    with candidates as (
      select n.id
      from public.notifications n
      where n.sms_pending
        and not n.sms_reconciliation_required
        and n.sms_delivery_started_at is null
        and n.sms_next_attempt_at <= now()
        and (
          n.sms_claimed_at is null
          or n.sms_claimed_at < now() - interval '15 minutes'
        )
      order by n.created_at, n.id
      for update skip locked
      limit v_limit
    ), claimed as (
      update public.notifications n
      set
        sms_claim_token = p_claim_token,
        sms_claimed_at = now(),
        sms_attempts = n.sms_attempts + 1,
        sms_last_error = null
      from candidates c
      where n.id = c.id
      returning n.id, n.user_id, n.title, n.body, n.sms_attempts
    )
    select c.id, c.user_id, c.title, c.body, c.sms_attempts,
      'wurx-sms-' || c.id::text
    from claimed c;
    return;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

create or replace function public.start_notification_delivery(
  p_channel text,
  p_notification_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_channel = 'email' then
    update public.notifications
    set email_delivery_started_at = now()
    where id = p_notification_id
      and email_pending
      and not email_reconciliation_required
      and email_delivery_started_at is null
      and email_claim_token = p_claim_token;
    return found;
  end if;

  if p_channel = 'sms' then
    update public.notifications
    set sms_delivery_started_at = now()
    where id = p_notification_id
      and sms_pending
      and not sms_reconciliation_required
      and sms_delivery_started_at is null
      and sms_claim_token = p_claim_token;
    return found;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_channel text,
  p_notification_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_channel = 'email' then
    update public.notifications
    set
      email_pending = false,
      emailed_at = now(),
      email_provider_message_id = nullif(p_provider_message_id, ''),
      email_claim_token = null,
      email_claimed_at = null,
      email_reconciliation_required = false,
      email_last_error = null
    where id = p_notification_id
      and email_pending
      and email_claim_token = p_claim_token
      and email_delivery_started_at is not null;
    return found;
  end if;

  if p_channel = 'sms' then
    update public.notifications
    set
      sms_pending = false,
      sms_sent_at = now(),
      sms_provider_message_id = nullif(p_provider_message_id, ''),
      sms_claim_token = null,
      sms_claimed_at = null,
      sms_reconciliation_required = false,
      sms_last_error = null
    where id = p_notification_id
      and sms_pending
      and sms_claim_token = p_claim_token
      and sms_delivery_started_at is not null;
    return found;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

create or replace function public.fail_notification_delivery(
  p_channel text,
  p_notification_id uuid,
  p_claim_token uuid,
  p_error text,
  p_retry_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_retry integer := greatest(30, least(coalesce(p_retry_seconds, 60), 86400));
  v_max_attempts integer := 8;
begin
  if p_channel = 'email' then
    update public.notifications
    set
      email_next_attempt_at = now() + make_interval(secs => v_retry),
      email_claim_token = null,
      email_claimed_at = null,
      email_delivery_started_at = null,
      email_reconciliation_required = email_attempts >= v_max_attempts,
      email_last_error = left(
        case
          when email_attempts >= v_max_attempts then
            'Maximum email delivery attempts reached; operator review required: ' ||
            coalesce(p_error, 'Unknown email delivery failure')
          else coalesce(p_error, 'Unknown email delivery failure')
        end,
        2000
      )
    where id = p_notification_id
      and email_pending
      and email_claim_token = p_claim_token;
    return found;
  end if;

  if p_channel = 'sms' then
    update public.notifications
    set
      sms_next_attempt_at = now() + make_interval(secs => v_retry),
      sms_claim_token = null,
      sms_claimed_at = null,
      sms_delivery_started_at = null,
      sms_reconciliation_required = sms_attempts >= v_max_attempts,
      sms_last_error = left(
        case
          when sms_attempts >= v_max_attempts then
            'Maximum SMS delivery attempts reached; operator review required: ' ||
            coalesce(p_error, 'Unknown SMS delivery failure')
          else coalesce(p_error, 'Unknown SMS delivery failure')
        end,
        2000
      )
    where id = p_notification_id
      and sms_pending
      and sms_claim_token = p_claim_token;
    return found;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

create or replace function public.mark_notification_delivery_reconciliation(
  p_channel text,
  p_notification_id uuid,
  p_claim_token uuid,
  p_error text,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_channel = 'email' then
    update public.notifications
    set
      email_claim_token = null,
      email_claimed_at = null,
      email_reconciliation_required = true,
      email_provider_message_id = coalesce(nullif(p_provider_message_id, ''), email_provider_message_id),
      email_last_error = left(coalesce(p_error, 'Ambiguous email provider outcome'), 2000)
    where id = p_notification_id
      and email_pending
      and email_claim_token = p_claim_token
      and email_delivery_started_at is not null;
    return found;
  end if;

  if p_channel = 'sms' then
    update public.notifications
    set
      sms_claim_token = null,
      sms_claimed_at = null,
      sms_reconciliation_required = true,
      sms_provider_message_id = coalesce(nullif(p_provider_message_id, ''), sms_provider_message_id),
      sms_last_error = left(coalesce(p_error, 'Ambiguous SMS provider outcome'), 2000)
    where id = p_notification_id
      and sms_pending
      and sms_claim_token = p_claim_token
      and sms_delivery_started_at is not null;
    return found;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

create or replace function public.requeue_notification_delivery(
  p_channel text,
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_channel = 'email' then
    update public.notifications
    set
      email_next_attempt_at = now(),
      email_claim_token = null,
      email_claimed_at = null,
      email_delivery_started_at = null,
      email_reconciliation_required = false,
      email_last_error = null
    where id = p_notification_id and email_pending;
    return found;
  end if;

  if p_channel = 'sms' then
    update public.notifications
    set
      sms_next_attempt_at = now(),
      sms_claim_token = null,
      sms_claimed_at = null,
      sms_delivery_started_at = null,
      sms_reconciliation_required = false,
      sms_last_error = null
    where id = p_notification_id and sms_pending;
    return found;
  end if;

  raise exception 'Unsupported notification channel: %', p_channel;
end;
$$;

revoke all on function public.recover_stale_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.start_notification_delivery(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_notification_delivery(text, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.mark_notification_delivery_reconciliation(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.requeue_notification_delivery(text, uuid) from public, anon, authenticated;

grant execute on function public.recover_stale_notification_deliveries(integer) to service_role;
grant execute on function public.claim_notification_deliveries(text, integer, uuid) to service_role;
grant execute on function public.start_notification_delivery(text, uuid, uuid) to service_role;
grant execute on function public.complete_notification_delivery(text, uuid, uuid, text) to service_role;
grant execute on function public.fail_notification_delivery(text, uuid, uuid, text, integer) to service_role;
grant execute on function public.mark_notification_delivery_reconciliation(text, uuid, uuid, text, text) to service_role;
grant execute on function public.requeue_notification_delivery(text, uuid) to service_role;
