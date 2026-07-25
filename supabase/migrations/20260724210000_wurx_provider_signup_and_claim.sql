-- Providers had no way to sign up (no INSERT policy on public.providers) and no
-- way to see or take an open booking (no dispatch mechanism existed at all).
-- This adds self-serve provider signup and a claim_booking() RPC that assigns
-- an open booking to the provider who claims it, mirroring the SECURITY DEFINER
-- pattern used by request_booking / cancel_booking / complete_booking.

create policy providers_insert_own on public.providers
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy bookings_select_open_for_providers on public.bookings
  for select to authenticated
  using (
    status = 'requested'
    and provider_id is null
    and exists (
      select 1
      from public.providers p
      join public.services s on s.id = bookings.service_id
      where p.user_id = auth.uid()
        and p.is_active
        and s.slug = any(p.service_slugs)
    )
  );

create or replace function public.claim_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_provider record;
  v_booking record;
  v_service_slug text;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_provider
  from public.providers
  where user_id = v_user;

  if v_provider.id is null then
    raise exception 'You are not a registered provider';
  end if;

  if not v_provider.is_active then
    raise exception 'Your provider profile is not active';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'requested' or v_booking.provider_id is not null then
    raise exception 'This booking is no longer available';
  end if;

  select s.slug into v_service_slug
  from public.services s
  where s.id = v_booking.service_id;

  if v_service_slug is null or not (v_service_slug = any(v_provider.service_slugs)) then
    raise exception 'This service is not one you offer';
  end if;

  update public.bookings
  set provider_id = v_provider.id, status = 'confirmed', updated_at = now()
  where id = p_booking_id;

  insert into public.job_offers (booking_id, provider_id, status, offered_at, responded_at)
  values (p_booking_id, v_provider.id, 'accepted', now(), now());
end;
$function$;

revoke all on function public.claim_booking(uuid) from public, anon;
grant execute on function public.claim_booking(uuid) to authenticated;
