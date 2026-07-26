-- Manual admin plan grants: lets an admin put a user on a plan without going
-- through Stripe Checkout (e.g. comping an account, testing, a goodwill grant).
-- Mirrors the shape stripe-webhook writes on checkout.session.completed /
-- invoice.paid, so a manually-granted subscription looks identical to a real
-- one everywhere else in the app (dashboard ring, admin users list, etc).

create or replace function public.admin_grant_plan(p_user_id uuid, p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_plan record;
  v_subscription_id uuid;
begin
  select (role = 'admin') into v_is_admin from public.profiles where id = v_caller;
  if not coalesce(v_is_admin, false) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select id, monthly_minutes into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan not found';
  end if;

  -- One subscription per user for manual grants: if they already have a
  -- manually-granted (non-Stripe) subscription, update it in place instead of
  -- creating a second active row.
  select id into v_subscription_id
  from public.subscriptions
  where user_id = p_user_id and stripe_subscription_id is null
  limit 1;

  if v_subscription_id is null then
    insert into public.subscriptions (
      user_id, plan_id, stripe_subscription_id, stripe_price_id, status,
      current_period_start, current_period_end
    )
    values (
      p_user_id, p_plan_id, null, null, 'active',
      now(), now() + interval '1 month'
    )
    returning id into v_subscription_id;
  else
    update public.subscriptions
    set plan_id = p_plan_id,
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + interval '1 month'
    where id = v_subscription_id;
  end if;

  insert into public.hour_ledger (user_id, delta_minutes, entry_type, description, subscription_id)
  values (p_user_id, v_plan.monthly_minutes, 'grant', 'Manual admin plan grant', v_subscription_id);

  return v_subscription_id;
end;
$$;

revoke all on function public.admin_grant_plan(uuid, uuid) from anon, public;
grant execute on function public.admin_grant_plan(uuid, uuid) to authenticated;
