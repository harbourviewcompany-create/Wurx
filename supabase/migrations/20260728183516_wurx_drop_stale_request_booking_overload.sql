-- The market-leading migration added an 8-arg request_booking (with
-- p_window_end) as a new overload rather than replacing the old one, since
-- the old 7-arg signature is a different Postgres function identity. The
-- only caller in the codebase (ServiceBrowser.tsx) already passes all 8
-- named args, so the old overload is dead code -- but leaving it in place
-- risks a future 7-arg caller silently skipping window_end. Drop it.
drop function if exists public.request_booking(uuid, timestamptz, int, text, text, text, text);
