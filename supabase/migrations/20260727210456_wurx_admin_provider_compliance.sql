-- Extend admin_set_provider_status so ops can record compliance fields
-- at the same moment they verify a provider.

create or replace function public.admin_set_provider_status(
  p_provider_id uuid,
  p_verification public.verification_status,
  p_is_active boolean,
  p_insurance_expires_at date default null,
  p_background_check_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.providers
  set
    verification = p_verification,
    is_active = p_is_active,
    insurance_expires_at = coalesce(p_insurance_expires_at, insurance_expires_at),
    background_check_at = coalesce(p_background_check_at, background_check_at),
    updated_at = now()
  where id = p_provider_id;

  -- When verifying, also notify the provider that they can start claiming jobs.
  if p_verification = 'verified' and p_is_active then
    perform public.notify_user(
      (select user_id from public.providers where id = p_provider_id),
      'provider_verified',
      'You are verified on Wurx',
      'Open jobs that match your services and area will now appear on your dashboard.'
    );
  end if;
end;
$function$;

-- Drop the old 3-arg signature so clients only see the extended one.
drop function if exists public.admin_set_provider_status(uuid, public.verification_status, boolean);

revoke all on function public.admin_set_provider_status(uuid, public.verification_status, boolean, date, timestamptz) from public, anon;
grant execute on function public.admin_set_provider_status(uuid, public.verification_status, boolean, date, timestamptz) to authenticated;
