# Wurx — Production readiness

Status as of this branch. ✅ = done, ⛳ = remaining (needs dashboard/secret access
that isn't available through the automated tooling), 🔭 = phase 2.

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

## ⛳ Remaining to go live (owner action — needs dashboard / secret access)

### 1. Vercel environment variables (`wurx` project)
The deployed app builds but pages 500 at runtime until these are set (Production
+ Preview), then redeploy:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://rzdavbuoisckvdapbcbj.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_x4MUHQBn3ceycJKfWu--jw_r3N5kyCz` (publishable — safe to expose) |
| `NEXT_PUBLIC_SITE_URL` | `https://wurx.vercel.app` |

### 2. Stripe webhook + Edge Function secrets
The `create-checkout` and `stripe-webhook` functions need secrets set with
`supabase secrets set` (or the dashboard → Edge Functions → Secrets):

- `STRIPE_SECRET_KEY` — the **live** secret key (`sk_live_…`).
- `SITE_URL` — `https://wurx.vercel.app`.
- `STRIPE_WEBHOOK_SIGNING_SECRET` — from the webhook endpoint you create next.

Create a **live** Stripe webhook endpoint pointing at:

```
https://rzdavbuoisckvdapbcbj.supabase.co/functions/v1/stripe-webhook
```

subscribed to: `checkout.session.completed`, `invoice.paid`,
`customer.subscription.updated`, `customer.subscription.deleted`. Copy its
signing secret into `STRIPE_WEBHOOK_SIGNING_SECRET`.

> Note: `create-checkout` runs with `verify_jwt = true`; `stripe-webhook` must
> stay `verify_jwt = false` (see `supabase/config.toml`).

### 3. Supabase Auth settings
- Set **Site URL** = `https://wurx.vercel.app` and add
  `https://wurx.vercel.app/auth/callback` (and the Vercel preview domains) to the
  allowed **Redirect URLs**.
- Configure **SMTP** so confirmation emails actually send, or disable email
  confirmation for launch (the signup flow already handles both cases).

### 4. Verify the money path end-to-end (in live or a test clone)
Subscribe → `checkout.session.completed` records the subscription →
`invoice.paid` grants minutes to `hour_ledger` → dashboard shows the balance →
book a service (holds minutes) → complete (consumes) / cancel (releases).

## Known advisor notes (accepted)

- `authenticated_security_definer_function_executable` (0029) fires for the three
  booking RPCs. This is **intended** — they are meant to be called by signed-in
  users and each re-checks `auth.uid()` and ownership internally. `anon` execute
  has been revoked.

## 🔭 Phase 2 (not built)

- Provider onboarding, verification, and job dispatch UI (the `job_offers`,
  `provider_earnings`, `provider_availability` tables and the
  `dispatchable_providers` view already exist to support it).
- Admin console (booking assignment, provider verification, `complete_booking`
  for ops until provider dispatch exists).
- Review submission UI (the `reviews` table + insert policy already exist).
- Customer profile editing and subscription management (cancel/change plan) UI.
