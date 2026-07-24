-- Service-role-only accessor for secrets held in Supabase Vault.
--
-- The stripe-webhook edge function reads its signing secret through this RPC
-- instead of an env var, so the secret lives in Vault (encrypted) and never in
-- this (public) repo or in function source. The secret value itself is inserted
-- out-of-band with vault.create_secret('...', 'STRIPE_WEBHOOK_SIGNING_SECRET'),
-- not in this migration.
create or replace function public.get_app_secret(p_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role;
