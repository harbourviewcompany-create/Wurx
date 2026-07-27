-- Reads a decrypted Vault secret by name. SECURITY DEFINER + service_role-only
-- grant so the stripe-webhook edge function (which uses the service key) can
-- fetch its signing secret without it being stored in the repo or in function code.
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
