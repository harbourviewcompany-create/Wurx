-- handle_new_user() is a SECURITY DEFINER trigger function. It must never be
-- callable directly via PostgREST (/rest/v1/rpc/handle_new_user), only fired
-- by the on_auth_user_created trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- set_updated_at() is SECURITY INVOKER but likewise has no business being
-- exposed as an RPC endpoint.
revoke all on function public.set_updated_at() from public, anon, authenticated;
