-- is_admin() was defined with no EXECUTE grant to authenticated or anon at
-- all. Postgres RLS has to evaluate every permissive policy on a table to
-- OR them together — so any table with an admin_*_access policy calling
-- is_admin() (services, plans, bookings, profiles, hour_ledger,
-- hour_holds) failed outright with "permission denied for function
-- is_admin" for every non-admin request, even for rows a different,
-- perfectly fine policy would have allowed through. In practice: the
-- public service browser (and anything else touching those tables) was
-- broken for every real user.
--
-- Applied directly to the live DB first as an emergency fix (confirmed via
-- has_function_privilege before/after) since this was actively breaking
-- production; this migration just brings the repo's history in line with
-- that so a fresh environment - or a future reconciliation pass - doesn't
-- silently drop it again.

grant execute on function public.is_admin() to authenticated, anon;
