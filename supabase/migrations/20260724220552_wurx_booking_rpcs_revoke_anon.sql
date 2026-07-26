revoke execute on function public.request_booking(uuid, timestamptz, int, text, text, text, text) from anon, public;
revoke execute on function public.cancel_booking(uuid) from anon, public;
revoke execute on function public.complete_booking(uuid) from anon, public;
