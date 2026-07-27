-- Perf: the admin bookings console computed provider eligibility with one
-- provider_can_serve_booking() RPC per (assignable booking x dispatchable
-- provider) pair. With N open bookings and M providers that is N*M separate
-- network round trips from the server component to Postgres on a single page
-- load (e.g. 40 bookings x 15 providers = 600 calls). This collapses the whole
-- thing into ONE round trip: a set-returning, admin-only function that returns
-- every eligible (booking_id, provider_id) pair for the requested bookings.
--
-- The eligibility rule itself is unchanged: it reuses provider_can_serve_booking
-- (service + FSA + availability + blackouts) and applies the same trust prefilter
-- that the dispatchable_providers view enforces (active, verified, insurance not
-- expired, minor guardian consent). The prefilter also trims the provider set
-- before the expensive per-pair check runs.
create or replace function public.admin_eligible_providers_for_bookings(p_booking_ids uuid[])
returns table (booking_id uuid, provider_id uuid)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_booking_ids is null or array_length(p_booking_ids, 1) is null then
    return;
  end if;

  return query
  select b.id, p.id
  from public.bookings b
  cross join public.providers p
  where b.id = any(p_booking_ids)
    and p.is_active
    and p.verification = 'verified'
    and (p.insurance_expires_at is null or p.insurance_expires_at >= current_date)
    and (p.is_minor = false or p.guardian_consent_at is not null)
    and public.provider_can_serve_booking(p.id, b.id);
end;
$$;

revoke all on function public.admin_eligible_providers_for_bookings(uuid[]) from public, anon;
grant execute on function public.admin_eligible_providers_for_bookings(uuid[]) to authenticated;
