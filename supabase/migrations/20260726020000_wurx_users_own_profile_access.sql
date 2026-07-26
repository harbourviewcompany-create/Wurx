-- No migration in this repo's history grants a user SELECT/UPDATE on
-- their own profiles row (only admin_read_profiles/admin_update_profiles
-- exist). The original base schema was applied directly in Supabase and
-- never captured as a migration, so it's possible an equivalent policy
-- already exists there — this is written idempotently (drop-if-exists)
-- so it's safe either way, and guarantees the new profile-editing page
-- actually works regardless of what's already live.
--
-- profiles_guard_role_change (added in the provider-trust-hardening
-- migration) already defends against a self-update also changing role,
-- so this doesn't reopen that.

drop policy if exists users_select_own_profile on public.profiles;
create policy users_select_own_profile on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists users_update_own_profile on public.profiles;
create policy users_update_own_profile on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
