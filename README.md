# Wurx

Subscription-based home-services marketplace for Ottawa. Customers subscribe to
a monthly plan that grants a bank of **service minutes**, then spend those
minutes booking services (cleaning, snow removal, lawn care, handyman, etc.).
Vetted local providers fulfil the bookings.

## Stack

- **Next.js 16** (App Router, React 19) — deployed on **Vercel**
- **Supabase** — Postgres + Auth + Row Level Security + Edge Functions
- **Stripe** — subscription billing (via Supabase Edge Functions)

The Supabase database is the single source of truth. The web app talks to it
exclusively through the Supabase client under RLS; privileged writes (billing,
minute accounting) go through Edge Functions and `SECURITY DEFINER` RPCs.

## Architecture

```
Browser ──▶ Next.js (Vercel)
                │  @supabase/ssr (anon key, RLS-scoped)
                ▼
            Supabase Postgres  ◀── SECURITY DEFINER RPCs (request/cancel/complete booking)
                ▲
                │ service role
   Stripe ──▶ Edge Functions (create-checkout, stripe-webhook)
```

- **Auth**: Supabase email/password via `@supabase/ssr`. Middleware refreshes the
  session on every request and guards `/dashboard`. A `handle_new_user` trigger
  creates the `profiles` row on signup.
- **Subscriptions**: the `create-checkout` Edge Function creates a Stripe Checkout
  session (looking the plan up server-side by price id). `stripe-webhook` records
  the subscription and grants `monthly_minutes` to `hour_ledger` on `invoice.paid`
  (idempotent via a unique `stripe_event_id`).
- **Bookings**: `request_booking` checks the customer's available balance and
  atomically creates the booking + an `hour_holds` hold. `complete_booking`
  captures the hold and writes a `consume` ledger entry; `cancel_booking`
  releases it. Balances are read from the `available_balances` view.

## Local development

```bash
cp .env.example .env.local   # fill in the NEXT_PUBLIC_* values
npm install
npm run dev
```

`npm run typecheck` and `npm run build` are gated in CI (`.github/workflows/ci.yml`).

## Environment variables

See `.env.example`. The app needs only the public `NEXT_PUBLIC_*` values. Edge
Functions use `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET` and `SITE_URL`
(set with `supabase secrets set`).

## Database migrations

SQL migrations live in `supabase/migrations/`. Apply with the Supabase CLI
(`supabase db push`) or the dashboard.

## Deploying Edge Functions

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

The files in `supabase/functions/` mirror what is live — see `supabase/config.toml`
for the per-function `verify_jwt` settings.

## Not yet built (see docs/PRODUCTION_READINESS.md)

Provider onboarding & dispatch UI, admin console, review submission UI, and the
Stripe products/prices + webhook wiring that make billing live.
