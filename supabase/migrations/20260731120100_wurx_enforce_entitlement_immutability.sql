-- Refuse plan mutations that would make a reused Stripe Price display a
-- different commercial entitlement from the immutable webhook grant snapshot.
-- Changing minutes, price, currency, or plan identity requires a new Stripe
-- Price id.

create or replace function public.capture_stripe_price_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.stripe_price_entitlements%rowtype;
begin
  if new.stripe_price_id is null then
    return new;
  end if;

  select * into v_existing
  from public.stripe_price_entitlements
  where stripe_price_id = new.stripe_price_id;

  if v_existing.stripe_price_id is not null then
    if v_existing.plan_id is distinct from new.id
       or v_existing.monthly_minutes is distinct from new.monthly_minutes
       or v_existing.price_cents is distinct from new.price_cents
       or v_existing.currency is distinct from 'cad'
    then
      raise exception
        'Stripe Price % already has an immutable entitlement; create a new Stripe Price for commercial changes',
        new.stripe_price_id;
    end if;
    return new;
  end if;

  insert into public.stripe_price_entitlements (
    stripe_price_id,
    plan_id,
    monthly_minutes,
    price_cents,
    currency
  ) values (
    new.stripe_price_id,
    new.id,
    new.monthly_minutes,
    new.price_cents,
    'cad'
  );

  return new;
end;
$$;

revoke all on function public.capture_stripe_price_entitlement()
  from public, anon, authenticated;
