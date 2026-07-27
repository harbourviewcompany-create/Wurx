# Wurx — Production readiness

Status as of this branch. ✅ = done, ⛳ = remaining (needs dashboard/secret access
that isn't available through the automated tooling), 🔭 = later.

**Customer conversion path & implementation order:** see
[`docs/FUNNEL_PLAYBOOK.md`](./FUNNEL_PLAYBOOK.md) — route map, F1–F5 tickets,
merge order, and smoke checklist. Use that before opening funnel or Phase 2 PRs.

## ✅ Done

- **App rebuilt on Supabase** — Prisma layer removed; Next.js talks to the real
  marketplace schema under RLS via `@supabase/ssr`. Auth, pricing, services,
  dashboard, subscribe, and booking flows implemented. `tsc` + `next build` green.
- **Booking backend** — `request_booking` / `cancel_booking` / `complete_booking`
  `SECURITY DEFINER` RPCs applied to the live database (migration
  `20260724170000_wurx_booking_rpcs_and_hardening.sql`, plus a follow-up that
  revokes `anon`/`public` EXECUTE so only signed-in users can call them).
- **DB hardening applied** — covering indexes on the 6 unindexed FKs; the
  duplicate `provider_availability` SELECT policy removed; the anonymous
  lead-insert policy tightened (was `WITH CHECK (true)`).
- **Edge functions** — deployed `create-checkout` / `stripe-webhook` mirrored back
  into the repo; the stale copies that would have regressed billing are gone.
- **Stripe (LIVE) products & prices created** and written into `plans.stripe_price_id`:
  | Plan | Price | Live price id |
  | --- | --- | --- |
  | Starter | $179/mo CAD | `price_1TwrHMHGqu2rN3IenoKKADzP` |
  | Home | $339/mo CAD | `price_1TwrHZHGqu2rN3IeEx6f5bzV` |
  | Plus | $629/mo CAD | `price_1TwrHyHGqu2rN3IeTP0gbIBV` |

## ✅ Also now done

- **Vercel env** — the public Supabase URL + publishable key + site URL are baked
  into `vercel.json`, so production and previews render without dashboard config.
- **Stripe webhook created & wired** — a live webhook endpoint
  (`…/functions/v1/stripe-webhook`, events `checkout.session.completed`,
  `invoice.paid`, `customer.subscription.updated/deleted`) is registered, and its
  signing secret is stored in **Supabase Vault**. The `stripe-webhook` function
  (v3) reads it via the service-role-only `public.get_app_secret` RPC — no secret
  in env or in this repo. The handler records subscriptions and grants minutes
  entirely from event payloads, so the **webhook needs no `STRIPE_SECRET_KEY`**.

## ✅ Stripe server key wired too

`create-checkout` (v3) now reads its Stripe **server key** from Supabase Vault
(name `STRIPE_SECRET_KEY`) via `public.get_app_secret`, same pattern as the
webhook. A live restricted key (`rk_live_…`) is stored there.

> The restricted key must have these Stripe permissions or checkout will error on
> first use: **Checkout Sessions: Write**, **Customers: Write**, **Prices/Products:
> Read**. If a subscribe attempt returns a permissions error, widen the key's
> scopes in the Stripe Dashboard (or store a full `sk_live_…` in Vault instead).

## ✅ Phase 2 product surface (shipped)

These were listed as “not built” earlier; they exist on `main` and this branch:

- **Provider onboarding** — `/become-a-pro` + `ProviderApplyForm`. Applications now
  land as `verification = pending`, `is_active = false` until an admin verifies.
- **Provider dashboard** — open jobs (RLS-matched), claim, complete, payouts,
  reviews, notifications.
- **Provider profile + availability** — services, areas, weekly hours, blackouts.
- **Matching** — `provider_can_serve_booking` (service + FSA + availability +
  blackout + verification + insurance). Shared by claim path, open-jobs RLS, and
  admin assignment.
- **Admin console** — bookings (status + assign), providers (verify/reject with
  insurance + background-check dates, activate, payout), services, plans, users.
- **Review submission** — `ReviewForm` on completed customer bookings; rating
  sync trigger on `providers.rating`.
- **Customer profile + subscription management** — profile edit + Stripe billing
  portal button.
- **Job fan-out** — on booking insert, matching verified providers receive an
  in-app `job_available` notification (email when Resend is configured).

## ⛳ Remaining to go live (owner action)

### 1. Live end-to-end test
Do one real subscribe on `wurx.vercel.app` (a signed-in user → Subscribe → Stripe
Checkout → back to dashboard). Watch `hour_ledger` for the `grant` entry. This is
the only way to confirm the restricted key's scopes and the full money path.

### 2. Supabase Auth settings
- Set **Site URL** = `https://wurx.vercel.app` and add
  `https://wurx.vercel.app/auth/callback` (and the Vercel preview domains) to the
  allowed **Redirect URLs**.
- Configure **SMTP** so confirmation emails actually send, or disable email
  confirmation for launch (the signup flow already handles both cases).

### 3. Verify the money path end-to-end (in live or a test clone)
Subscribe → `checkout.session.completed` records the subscription →
`invoice.paid` grants minutes to `hour_ledger` → dashboard shows the balance →
book a service (holds minutes) → complete (consumes) / cancel (releases).

### 4. Apply new migrations on the live project
```bash
supabase db push
# or apply:
#   20260727120000_wurx_phase2_provider_ops.sql
#   20260727120100_wurx_admin_provider_compliance.sql
```

## Known advisor notes (accepted)

- `authenticated_security_definer_function_executable` (0029) fires for the three
  booking RPCs. This is **intended** — they are meant to be called by signed-in
  users and each re-checks `auth.uid()` and ownership internally. `anon` execute
  has been revoked.

## 🔭 Later (nice-to-have, not launch blockers)

Much of Phase 2 UI exists on `main` (provider apply, claim/complete, admin,
reviews, billing portal, multi-offer accept/decline dispatch). Remaining
ops/dispatch work is tracked in open PRs and in `FUNNEL_PLAYBOOK.md` §3 F5 /
§4 merge order.

- Document upload for insurance / background-check evidence (dates are recorded
  today; files are not).
- Provider map / radius-based geo match beyond FSA lists.

---

## Platform hardening (prior pass)

Closed most of the remaining gaps. Everything below is **applied to the live
project and verified**, not just committed.

### Fixed — critical
- **`complete_booking` could never run.** It locked with `FOR UPDATE` across a
  `LEFT JOIN`, which Postgres rejects outright, so every call raised: no booking
  could be completed, no minutes consumed, no provider earnings recorded. Found
  by actually executing the flow end-to-end. Now locks only the bookings row.
- **Minutes leaked into abandoned bookings.** A booking nobody claimed stayed
  `requested` forever, holding the customer's minutes hostage. `pg_cron` now
  cancels stale bookings and releases the holds every 15 minutes.

### Added
- **Notifications spine** — `notifications` table written by DB triggers on
  every booking transition, for both customer and provider. In-app feed on both
  dashboards; `send-notifications` edge function drains the queue via Resend
  and **no-ops cleanly when no API key is set**, so email can be enabled later
  by adding the key alone.
- **Customers can cancel/change plan** — `billing-portal` edge function +
  "Manage subscription" on the dashboard. Previously there was no in-app path.
- **Providers can be paid** — `provider-payouts` edge function creates a Stripe
  Connect Express account and onboarding link; provider dashboard shows pending
  vs paid earnings. `provider_earnings` had been accruing with nowhere to send
  money.
- **Configurable platform fee** — `app_settings.platform_fee_bps` (was a
  hardcoded 20% in SQL). Admin-only via RLS.
- **Job offers expire** — `pg_cron` every 5 minutes.
- **Tests** — `vitest` covering booking economics (multipliers, ceil rounding,
  affordability edges, fee split invariants). The earnings test asserts the exact
  values the live database produced, so the TypeScript and SQL cannot drift.
  Wired into CI.

### Fixed — security
- Revoked `anon`/`authenticated` EXECUTE on trigger functions, `is_admin()` and
  `get_setting_int()` — Supabase default-grants had exposed them as REST RPCs.

## ⛳ Still outstanding (needs you)

1. **Turn on email** — add `RESEND_API_KEY` (+ optional `NOTIFY_FROM_EMAIL`) to
   Vault and schedule `send-notifications`. Until then, in-app notifications
   work and the email queue self-drains.
2. **Supabase Auth** — Site URL, redirect URLs, and SMTP. Without SMTP,
   confirmation emails don't send and **new users cannot complete signup**.
3. **Enable leaked-password protection** (Auth → Passwords).
4. **Live subscribe test** — proves the restricted Stripe key's scopes end to
   end. Connect onboarding also requires Connect enabled on the Stripe account.
5. **Rotate the `rk_live_` key** that was pasted in chat.
6. **Fix the `main` branch-protection rule** — it requires two status-check
   contexts nothing produces, which blocks every PR.
7. **Apply Phase 2 migrations** on the live Supabase project (see above).
