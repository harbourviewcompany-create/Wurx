-- dispatch_booking_offers is called from the booking trigger (security definer)
-- and admin_redispatch_booking. Direct client calls should not be allowed.
revoke all on function public.dispatch_booking_offers(uuid) from public, anon, authenticated;
