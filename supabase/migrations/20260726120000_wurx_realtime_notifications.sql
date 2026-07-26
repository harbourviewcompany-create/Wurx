-- Wurx — live activity feed
--
-- Publishes `notifications` on the Realtime publication so an open dashboard
-- learns about a booking transition the moment the trigger writes it, instead
-- of on the next manual refresh. Realtime's postgres_changes stream is filtered
-- by RLS for authenticated subscribers, and `notifications_select_own` already
-- restricts rows to `auth.uid() = user_id`, so a subscriber can only ever
-- receive their own notifications.
--
-- `bookings` is deliberately NOT published: its rows carry customer addresses,
-- and every booking transition already writes a notification for both sides,
-- which is enough for the client to know it should refetch.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- INSERT payloads carry the full new row; UPDATE/DELETE payloads only need the
-- key, so the default replica identity is sufficient and no extra column data
-- is written to WAL.
