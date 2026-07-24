# Wurx

Subscription-based local home services marketplace. Customers subscribe for
monthly hour credits and book cleaning, snow removal, landscaping, or
handyman jobs; a matching engine assigns an available provider; hours are
debited automatically when a job is completed.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **Supabase**: Postgres + Auth + Row Level Security + Edge Functions
  (single source of truth for data — no separate ORM/database)
- **Stripe**: subscription billing, via Supabase Edge Functions
- **Tailwind CSS**, mobile-first

## Data model

See `supabase/migrations/0001_initial_schema.sql` for the full schema:

- `profiles` — one row per authenticated user (customer, provider, or admin),
  auto-created by a trigger on `auth.users` insert
- `provider_profiles` — skills, hourly rate, rating, service radius
- `subscriptions` — Stripe-backed plan + hours included per billing cycle
- `hour_ledger` — append-only credit/debit log; balance is
  `sum(amount)` per user, exposed via the `hour_balances` view
- `jobs` — a booked service request, matched to a provider, tracked through
  `pending -> matched -> in_progress -> completed`

`supabase/migrations/0002_complete_job_function.sql` adds `complete_job()`,
a `security definer` function that transitions a job to `completed` and
debits the customer's hour ledger atomically, so the two can't drift apart.

Everything is protected by Row Level Security — see the policies at the
bottom of the migration. Reads/writes are scoped to `auth.uid()`; the only
privileged writes (hour ledger, Stripe metadata) happen via the Edge
Functions using the service role key, or via `complete_job()`.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Stripe values
npm run dev
```

Apply the schema to your Supabase project (either via the SQL editor or the
CLI):

```bash
supabase link --project-ref rzdavbuoisckvdapbcbj
supabase db push
```

Deploy the Edge Functions:

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SIGNING_SECRET=... SITE_URL=...
```

## Structure

```
app/
  page.tsx              landing page
  login/, signup/        auth pages (Supabase Auth, email+password)
  auth/callback/         exchanges the email confirmation code for a session
  dashboard/              server-rendered, role-aware (customer vs provider)
  api/jobs/               create/list jobs, trigger matching, complete jobs
lib/
  supabase/               browser/server/service-role clients + DB types
  matching.ts              scoring engine (skill, distance, rating)
proxy.ts                  refreshes the auth session + protects /dashboard
supabase/
  migrations/              schema + RLS + complete_job()
  functions/               Stripe checkout + webhook Edge Functions
```
