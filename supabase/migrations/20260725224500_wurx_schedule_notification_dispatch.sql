-- send-notifications existed and was deployed, but nothing ever invoked it —
-- notifications would queue in email_pending forever. Schedule it via pg_cron,
-- calling a SECURITY DEFINER wrapper (rather than embedding the dispatch
-- secret directly in cron.job's stored command text, which is otherwise
-- readable by anyone with access to the cron schema).

create extension if not exists pg_net;

create or replace function public.dispatch_send_notifications()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
  v_project_url text := 'https://rzdavbuoisckvdapbcbj.supabase.co';
begin
  select get_app_secret into v_secret from public.get_app_secret('NOTIFY_DISPATCH_SECRET') as get_app_secret;

  perform net.http_post(
    url := v_project_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', coalesce(v_secret, '')
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.dispatch_send_notifications() from anon, authenticated, public;

select cron.unschedule('wurx-send-notifications')
  where exists (select 1 from cron.job where jobname = 'wurx-send-notifications');

select cron.schedule('wurx-send-notifications', '*/2 * * * *',
  $cron$select public.dispatch_send_notifications();$cron$);
