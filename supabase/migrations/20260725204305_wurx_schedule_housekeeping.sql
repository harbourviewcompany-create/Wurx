create extension if not exists pg_cron;

select cron.unschedule('wurx-expire-offers')
  where exists (select 1 from cron.job where jobname = 'wurx-expire-offers');
select cron.unschedule('wurx-expire-bookings')
  where exists (select 1 from cron.job where jobname = 'wurx-expire-bookings');

select cron.schedule('wurx-expire-offers', '*/5 * * * *',
  $cron$select public.expire_stale_offers();$cron$);
select cron.schedule('wurx-expire-bookings', '*/15 * * * *',
  $cron$select public.expire_abandoned_bookings();$cron$);
