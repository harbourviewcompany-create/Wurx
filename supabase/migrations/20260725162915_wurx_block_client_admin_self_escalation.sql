-- Wurx: block client-side self-escalation to admin.
--
-- profiles_update_own (RLS) only restricts WHICH row a user can update (their
-- own), not which columns or values — and authenticated holds a blanket
-- table-level UPDATE grant on profiles. So any signed-in user could currently
-- call `.from('profiles').update({ role: 'admin' })` on their own row from the
-- browser and grant themselves the admin console: verify/reject any provider,
-- and assign or cancel any customer's booking (admin_set_provider_status /
-- admin_assign_booking / admin_cancel_booking all gate purely on
-- profiles.role = 'admin'). That grant only became dangerous once this
-- session's admin console commits shipped real admin RPCs behind it.
--
-- A column-level grant can't express "this column, but only to some values,"
-- so this uses a trigger instead. It only fires for requests carrying a JWT
-- (auth.uid() is not null) — direct SQL / migrations run outside that context
-- and are unaffected, so provisioning an admin by hand still works exactly as
-- before. ProviderApplyForm's existing client-side `role: 'provider'` self-set
-- is untouched — this only blocks a transition into 'admin' from anything else.

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and new.role = 'admin'
     and old.role <> 'admin'
  then
    raise exception 'Cannot self-assign admin role' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();
