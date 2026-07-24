# Wurx — Supabase & Vercel Review

**Reviewed commit:** `8c3c802` (current `main`)
**Scope:** Supabase (database, edge functions, auth) and Vercel (build, deploy, config) integration.
**Method:** Static review of the repo cross-checked against the *live* Supabase project
`Wurx` (`rzdavbuoisckvdapbcbj`) and the *live* Vercel project `wurx`
(`prj_oqkxEN6ezWTyx0nqoqQwT0xlkjr9`, team `wurx`).

---

## TL;DR verdict

`main` currently **builds and deploys green on Vercel**, but that green light is
misleading: the deployed pages are a thin shell whose API routes are never exercised.
The repository and the real, running product are effectively **two different
applications wired to two different databases**:

- **The repo's Next.js app** talks to a **Prisma `User`/`Provider`/`Job`** schema.
- **The live product** is a **Supabase marketplace** (`profiles`, `providers`,
  `bookings`, `subscriptions`, `plans`, `services`, `hour_ledger`, …) driven by
  **deployed Stripe edge functions** that the repo does not faithfully represent.

The single most important issue is this **split-brain data layer**. Everything else
(Supabase auth never wired in, stale edge-function copies, the matching stub, env-var
drift) is a symptom of it. A prior branch, `feature/supabase-rewrite` (`5c33f09`,
unmerged, its preview deploy errored), already attempted exactly this consolidation —
that is the right direction and should be revived rather than re-invented.

---

## 🔴 Critical — the split-brain data layer

### 1. The app queries a Prisma schema that does not exist in the live database
- `prisma/schema.prisma` defines `User`, `Provider`, `Job` (+ `Role`, `JobStatus`).
- `app/api/jobs/route.ts`, `app/api/jobs/complete/route.ts` call
  `prisma.job.findMany() / .create() / .update()` via `lib/db.ts`.
- The live Supabase `public` schema has **no `Job` and no `User` table**. It has
  `profiles`, `providers`, `bookings`, `subscriptions`, `plans`, `services`,
  `hour_ledger`, `hour_holds`, `job_offers`, `provider_earnings`, `reviews`,
  `provider_availability`, `provider_blackouts`, `wurx_ottawa_leads`.

**Consequence:** if `DATABASE_URL` points at this Supabase Postgres, every `/api/jobs*`
call fails at runtime (`relation "Job" does not exist`). If it points at some *other*
database, then the jobs flow and the Stripe/hours flow live in two disconnected
datastores. Either way the app is not talking to the real product schema.

### 2. The repo's edge functions are stale and would *regress* production if redeployed
The deployed functions are correct and sophisticated; the repo copies are neither.

`supabase/functions/stripe-webhook/index.ts` (repo):
- Inserts into `hour_ledger` with columns **`amount`, `type`** — these columns **do not
  exist**. The real table uses `delta_minutes` and `entry_type`
  (`grant|consume|adjustment|refund|expiry`), plus a **unique `stripe_event_id`** for
  idempotency.
- Credits hours on `checkout.session.completed` and handles **only** that event.
- **Deployed version** instead: upserts `subscriptions` on checkout, grants minutes on
  **`invoice.paid`** (idempotently, guarded by the unique `stripe_event_id` so Stripe's
  retries can't double-credit), and syncs status on
  `customer.subscription.updated|deleted`. Uses `stripe@^17`.

`supabase/functions/create-checkout/index.ts` (repo):
- Uses `stripe@^14`, trusts a **client-supplied `hours`** value, has no CORS/OPTIONS.
- **Deployed version** uses `stripe@^17`, **looks the plan up server-side by
  `stripe_price_id`** (never trusts client minute/hour amounts), sets
  `plan_id`/`monthly_minutes` metadata, and handles CORS + preflight.

**Consequence:** the repo is not the source of truth for the edge functions. A
`supabase functions deploy` from this repo would **break the working billing webhook**
and reintroduce a client-trusts-hours vulnerability. The deployed source should be
committed back into the repo verbatim so infra-as-code matches reality.

### 3. Matching is a stub, and the "v2" is dead, non-compiling code
- `lib/matching.ts` `matchProviderToJob()` returns a hardcoded
  `{ matchedProviderId: 'provider-1' }`.
- `backend/src/services/matching.service.ts` references Prisma fields that don't exist
  on any model (`provider.isAvailable`, `job.category`, `job.latitude/longitude`,
  `provider.latitude/longitude`, `provider.hourlyRate`, `job.budget`). It only compiles
  because `tsconfig.json` **excludes `backend/`** — so it silently rots.
- The real matching signal already lives in Supabase: `providers.service_slugs`,
  `providers.base_postal_code`, `providers.travel_radius_km`, `providers.rating`,
  `provider_availability`, `provider_blackouts`, `job_offers`. Real matching should be
  built against those, not the Prisma stub.

---

## 🟠 Supabase findings

### 4. Supabase auth is not wired into the Next.js app at all
- `lib/supabase.ts` and `lib/supabaseClient.ts` are **both dead code** — no file under
  `app/` imports either (verified). `@supabase/ssr` is a dependency but **unused**.
- `lib/supabaseClient.ts` builds a "server" client from the **anon key** with
  `persistSession: true` / `autoRefreshToken: true` — wrong for server routes (no
  durable per-request storage) and not the cookie-based `@supabase/ssr` pattern.
- Because the API routes go through Prisma on a privileged connection, they **bypass
  RLS entirely** and have **no authentication** (`userId` is taken from the request
  body — see `app/api/jobs/route.ts` `body.userId` and the `'demo-user'` literal in
  `app/components/CreateJobForm.tsx`). RLS is enabled on every table, but the app never
  goes through it.

**Fix:** adopt the `@supabase/ssr` cookie pattern (browser client + server client +
middleware refresh), derive `userId` from the authenticated session, and let RLS do the
authorization. (`feature/supabase-rewrite` already implemented this.)

### 5. Security advisor — permissive RLS on `wurx_ottawa_leads`
`WARN 0024`: policy `allow_anon_insert` on `public.wurx_ottawa_leads` is
`INSERT ... WITH CHECK (true)` for `anon` — unrestricted anonymous insert. Acceptable
for a public lead-capture form, but it invites spam. Add a CAPTCHA/turnstile check,
per-IP rate limiting, or route inserts through an edge function that validates.
Ref: https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

### 6. Performance advisors (all INFO/WARN, pre-launch so low urgency)
- **Unindexed foreign keys** (add covering indexes before load):
  `bookings.service_id`, `hour_ledger.booking_id`, `hour_ledger.subscription_id`,
  `provider_earnings.booking_id`, `reviews.author_id`, `subscriptions.plan_id`.
  Ref: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- **Multiple permissive SELECT policies** on `provider_availability` for
  `authenticated` (`availability_select_public` + `availability_write_own`) — consolidate
  into one policy.
  Ref: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
- Many **unused indexes** are reported — expected on an empty pre-launch DB; ignore for now.

### 7. `verify_jwt` settings are correct (noted as good)
`create-checkout` = `verify_jwt: true`, `stripe-webhook` = `verify_jwt: false`
(correct — Stripe authenticates via signature, not a Supabase JWT).

---

## 🟠 Vercel findings

### 8. Framework detection — fixed, but understand *why*
The project's dashboard `framework` setting is **`null`**, which produced a long run of
`ERROR` deployments ("missing public directory"). Commit `8c3c802` added
`vercel.json → {"framework":"nextjs"}`, and the current production deploy is **READY**.
`vercel.json` keeps this reproducible; also set Framework Preset = **Next.js** in the
dashboard so the two don't drift.

### 9. Site-URL env var is inconsistent across runtimes
- Next app (`lib/stripe.ts`) uses **`NEXT_PUBLIC_SITE_URL`**.
- Edge functions use **`SITE_URL`** (falling back to `https://wurx.vercel.app`).

Two different names for the same concept across the two runtimes. Set **both**, keep
them equal, and document them — otherwise checkout success/cancel redirects can point at
different origins depending on which path created the session.

### 10. No env-var validation; pervasive `!` non-null assertions
`process.env.X!` throughout (`lib/stripe.ts`, `lib/supabase*.ts`) turns a missing
variable into a cryptic runtime crash. Add a small startup validator (e.g. `zod`
`.parse(process.env)`) so misconfiguration fails loudly and early.

### 11. Deploy-history hygiene
- The current READY production deploy is `8c3c802` (main).
- **PR #1** (`ci/typecheck-build-gate`, `bb606088`) — its Vercel preview is **ERROR**,
  and it overlaps with fixes already merged to `main` (tsconfig, `.gitignore`, lockfile,
  Stripe `apiVersion`, subscriptions-route `priceId`). Reconcile it against current
  `main` before merging; the CI workflow (`tsc --noEmit` + `next build`) is worth
  keeping, the duplicated fixes are not.
- Stack: Vercel Node `24.x`, Next `^16`, React `19`. Next 16 is very new — pin exact
  versions and keep the lockfile committed (now done) to avoid surprise breakage.

---

## Prioritized action list

| # | Priority | Action |
|---|----------|--------|
| 1 | 🔴 | Decide the source of truth (it is Supabase) and consolidate onto it — revive `feature/supabase-rewrite`. Remove/replace the Prisma `Job`/`User` layer and the Prisma-based API routes. |
| 2 | 🔴 | Commit the **deployed** `create-checkout` and `stripe-webhook` source back into `supabase/functions/` so the repo matches production. Never redeploy the current stale repo copies. |
| 3 | 🔴 | Replace the matching stub with a real query over Supabase `providers` + `provider_availability`; delete the non-compiling `backend/src/services/matching.service.ts`. |
| 4 | 🟠 | Wire Supabase auth via `@supabase/ssr` (browser + server client + middleware); derive `userId` from the session; delete the two dead client files. |
| 5 | 🟠 | Unify the site-URL env var across Next and edge functions; add env-var validation. |
| 6 | 🟠 | Add covering indexes for the 6 unindexed FKs; consolidate the duplicate `provider_availability` SELECT policies; harden the anon lead-insert policy. |
| 7 | 🟢 | Reconcile PR #1 against `main` (keep CI, drop duplicates); set Framework = Next.js in the Vercel dashboard to match `vercel.json`. |

---

## What is already good
- Live DB is well-modelled: sensible enums, `CHECK` constraints, RLS enabled on every
  table, an idempotent `hour_ledger.stripe_event_id`, and a clean minutes-based credit
  ledger with holds (`hour_holds`) and earnings (`provider_earnings`).
- Deployed edge functions are secure (server-side plan lookup, signature-verified
  webhook, idempotent crediting) and correct.
- Vercel build is green again after the `vercel.json` fix; lockfile is now committed.
