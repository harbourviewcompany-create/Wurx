# Wurx

Subscription-based home-services marketplace for Ottawa. Customers subscribe to
a monthly plan that grants a bank of **service minutes**, then spend those
minutes booking services (cleaning, snow removal, lawn care, handyman, etc.).
Vetted local providers fulfil the bookings.

**Live:** [wurx.vercel.app](https://wurx.vercel.app)

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
   Stripe ──▶ Edge Functions (create-checkout, stripe-webhook, billing-portal, provider-payouts)
```

- **Auth**: Supabase email/password via `@supabase/ssr`. Middleware refreshes the
  session on every request and guards `/dashboard`. A `handle_new_user` trigger
  creates the `profiles` row on signup.
- **Subscriptions**: the `create-checkout` Edge Function creates a Stripe Checkout
  session (looking the plan up server-side by price id). `stripe-webhook` records
  the subscription and grants `monthly_minutes` to `hour_ledger` on `invoice.paid`
  (idempotent via a unique `stripe_event_id`). Secrets live in Supabase Vault
  (`get_app_secret`).
- **Bookings**: `request_booking` checks the customer's available balance and
  atomically creates the booking + an `hour_holds` hold. Multi-offer dispatch
  fans out to matching providers; `complete_booking` / `cancel_booking` settle
  holds. Balances are read from the `available_balances` view.
- **Providers**: apply at `/become-a-pro`, claim/accept offers, complete jobs,
  manage availability, Connect payouts.
- **Admin**: `/admin` — bookings, providers (verify + compliance dates), services,
  plans, users (roles, grant minutes/plan).

## Product surface (shipped)

| Area | Routes / pieces |
|------|-----------------|
| Customer funnel | Home → pricing → auth (plan preserved) → Stripe → dashboard → book → review |
| Provider | `/become-a-pro`, `/provider/dashboard`, `/provider/profile`, multi-offer accept/decline |
| Admin | `/admin` bookings / providers / services / plans / users |
| Billing | Live Stripe prices on plans, checkout + webhook + billing portal + Connect payouts |

Operational launch checklist and owner-only dashboard tasks:
[`docs/PRODUCTION_READINESS.md`](./docs/PRODUCTION_READINESS.md).

Conversion path and merge order: [`docs/FUNNEL_PLAYBOOK.md`](./docs/FUNNEL_PLAYBOOK.md).

## Local development

```bash
cp .env.example .env.local   # fill in the NEXT_PUBLIC_* values
npm install
npm run dev
```

`npm run typecheck`, `npm test`, and `npm run build` are gated in CI
(`.github/workflows/ci.yml`).

## Environment variables

See `.env.example`. The app needs only the public `NEXT_PUBLIC_*` values. Edge
Functions read Stripe keys and webhook secrets from **Supabase Vault** via
`get_app_secret` (not from this repo).

## Database migrations

SQL migrations live in `supabase/migrations/`. Apply with the Supabase CLI
(`supabase db push`) or the dashboard.

## Deploying Edge Functions

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy billing-portal
supabase functions deploy provider-payouts
supabase functions deploy send-notifications
```

The files in `supabase/functions/` mirror what is live — see `supabase/config.toml`
for the per-function `verify_jwt` settings.
