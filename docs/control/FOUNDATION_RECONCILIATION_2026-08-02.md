# Wurx Foundation Capability Reconciliation

**Date:** 2026-08-02  
**Repository baseline:** `harbourviewcompany-create/Wurx` `main`  
**Package reviewed:** `wurx-foundation-v0.1.0.zip`  
**Prior review:** PR #66  
**Reconciliation branch:** `feature/foundation-reconciliation`

## Decision

Current `main` remains the source of truth. The package is an earlier foundation, not a replacement tree. Only one missing and materially useful capability was ported: a working lint command enforced by repository CI. The package application, schema, checkout, webhook, provider, and admin implementations were not overlaid.

## Classification definitions

- **Already implemented:** current `main` contains the capability at equal or greater maturity.
- **Partially implemented:** current `main` contains the core capability but differs in scope or implementation.
- **Missing:** the package capability is absent from `main` and remains potentially useful.
- **Obsolete:** current `main` has superseded the package design.
- **Unsafe:** importing the package capability would weaken a verified security, financial, or operational control.

## Capability matrix

| # | Package capability | Classification | Current-main evidence and reconciliation decision |
|---:|---|---|---|
| 1 | Single Next.js App Router application | Already implemented | Current repository is a mature Next.js App Router application with customer, provider, admin, auth, pricing, and service routes. |
| 2 | TypeScript application and `tsc --noEmit` gate | Already implemented | `typecheck` exists and runs in CI. |
| 3 | Tailwind-based application styling | Partially implemented | Current UI uses the established repository styling system; replacing it with the package theme would regress newer UI work. |
| 4 | Mobile customer navigation and app shell | Already implemented | Current customer application has production navigation and materially broader route coverage. |
| 5 | Marketing homepage | Already implemented | Current public site is more complete and connected to live product flows. |
| 6 | Membership pricing page | Already implemented | Current pricing is backed by live plan data and hardened checkout components. |
| 7 | Supabase email/password authentication | Already implemented | Current login, signup, password recovery, SSR session handling, and protected routes exceed the package. |
| 8 | Supabase SSR middleware/session refresh | Already implemented | Existing server/client helpers and route protection are established. |
| 9 | Automatic profile creation on signup | Already implemented | Current migrations and profile model supersede the package trigger. |
| 10 | Role model for customers and providers | Already implemented | Current repository includes customer, provider, and admin authorization and richer provider verification. |
| 11 | Dispatcher/support/admin role enum from package | Obsolete | Current authorization model and operational workflows should not be replaced by the package enum. |
| 12 | Property-centric `properties` table | Partially implemented | Current profile/address and booking model covers active product flows; package table cannot be imported without a deliberate product migration. |
| 13 | Service category catalogue | Already implemented | Current `services` catalogue includes durations, multipliers, licensing, icons, ordering, and booking integration. |
| 14 | Seeded cleaning, lawn, snow, and handyman categories | Already implemented | Current service catalogue is broader and production-connected. |
| 15 | Subscription plans table | Already implemented | Current plans include Stripe identifiers, prices, monthly minutes, presentation data, and active-plan handling. |
| 16 | Subscription records linked to Stripe | Already implemented | Current subscription lifecycle and dashboard state exceed the package. |
| 17 | Immutable service-hour ledger | Already implemented | Current `hour_ledger` and balance views support grants, holds/reservations, releases, usage, refunds, and Stripe event identity. |
| 18 | Available-hours SQL function | Obsolete | Current available/held balance views and minute-based product model are the active contract. |
| 19 | Provider profiles | Already implemented | Current provider application, verification, services, ratings, availability, jobs, earnings, and payouts are substantially more complete. |
| 20 | Provider-service join table | Already implemented | Current provider service coverage is integrated into dispatch and job visibility. |
| 21 | Provider dashboard placeholder | Obsolete | Current professional dashboard is functional; importing the placeholder would be a regression. |
| 22 | Admin page placeholder | Obsolete | Current admin workflows are functional and protected. |
| 23 | Work-order record and lifecycle | Already implemented | Current booking lifecycle, offers, claims, statuses, recurrence/rebooking, and provider matching exceed the package work-order model. |
| 24 | Work-order event history | Already implemented | Current booking events, notifications, activity, and operational records provide richer lifecycle evidence. |
| 25 | Basic provider matching concept | Already implemented | Current dispatch includes service, area, availability, offers, preferred-provider first refusal, expiry, and fan-out. |
| 26 | PostGIS/geospatial-ready location fields | Partially implemented | Current service-area and dispatch geography are established; package latitude/longitude fields are not a safe standalone migration. |
| 27 | Stripe-hosted subscription Checkout | Already implemented | Current Checkout flow is implemented through Supabase Edge Functions. |
| 28 | Checkout accepting client-controlled user identity | Unsafe | PR #60 removed this cross-account authorization defect. Caller identity must remain bound to a verified Supabase JWT. |
| 29 | Duplicate-click Checkout handling | Already implemented | Current checkout uses caller/price-bound Stripe idempotency and active-subscription guards. |
| 30 | Stripe Customer Portal | Already implemented | Current account/dashboard subscription management already exposes customer self-management. |
| 31 | Direct Next.js Stripe webhook route | Obsolete | Current Supabase Stripe webhook architecture is the active deployment model. |
| 32 | Signature verification for Stripe webhooks | Already implemented | Current webhook verifies Stripe signatures with a protected secret. |
| 33 | Persisted Stripe event IDs for idempotency | Already implemented | Current security verification records the operational webhook; open PR #61 further hardens the durable inbox but is not treated as merged baseline. |
| 34 | `invoice.paid` monthly-hour grants | Already implemented | Current Stripe lifecycle grants plan minutes and protects against duplicate event credits. |
| 35 | Package webhook acknowledging after partial processing | Unsafe | Current controls must not be downgraded; failed entitlement writes require retry-safe handling. |
| 36 | Stripe Connect provider account field | Already implemented | Current embedded Stripe Connect provider onboarding is merged. |
| 37 | Embedded provider payout onboarding | Already implemented | PR #57 is merged; package does not provide this capability. |
| 38 | Provider payout execution | Already implemented | Current repository contains provider earnings and payout flows; later open hardening PRs remain separate from this reconciliation. |
| 39 | PostHog browser initialization | Missing | Package includes basic initialization, but current main does not expose verified analytics instrumentation. Not ported because event taxonomy, consent, environment ownership, and data-governance requirements are unresolved. |
| 40 | PostHog event taxonomy | Missing | Package does not define a meaningful taxonomy either; adding only auto-capture would not constitute a controlled analytics implementation. |
| 41 | Supabase Row Level Security | Already implemented | Current database has materially broader RLS and verified Edge Function boundaries. |
| 42 | Package RLS limited to customer self-access | Obsolete | It omits current provider/admin/dispatch/financial controls and cannot replace current policies. |
| 43 | Service-role server client | Already implemented | Current server and Edge Function architecture uses elevated access behind controlled boundaries. |
| 44 | Environment-variable template | Already implemented | Current `.env.example`, Vercel configuration, and runtime contracts are broader. |
| 45 | GitHub Actions `npm ci` | Already implemented | Current CI installs from the committed lockfile. |
| 46 | GitHub Actions typecheck | Already implemented | Current CI runs `npm run typecheck`. |
| 47 | GitHub Actions unit tests | Already implemented | Current CI runs Vitest; repository coverage is materially broader. |
| 48 | GitHub Actions production build | Already implemented | Current CI runs `next build` with non-secret placeholders. |
| 49 | Executable lint command | Missing | Current `next lint` is invalid under Next.js 16. Reconciled using pinned Biome 2.2.4 invocation. |
| 50 | Lint enforced in CI | Missing | Reconciled by adding `npm run lint` between typecheck and tests. |
| 51 | Package ESLint 9 configuration | Partially implemented | Its intent is valid, but importing the full dependency/toolchain would require lockfile churn. A pinned no-lockfile Biome gate already tested in current Wurx work was selected. |
| 52 | `verify` aggregate script | Missing | Reconciled as typecheck, lint, tests, and build. |
| 53 | Vitest configuration | Already implemented | Current repository tests execute successfully under its existing configuration. |
| 54 | Basic ledger tests | Already implemented | Current tests cover checkout, booking, provider payouts, notifications, and other product contracts beyond the package. |
| 55 | Playwright dependency and `test:e2e` script | Partially implemented | Current main does not include the package’s simple E2E setup; comprehensive UI QA exists in open PR #64 and should not be duplicated here. |
| 56 | Package Playwright workflow absent from CI | Obsolete | The ZIP declares Playwright but its provided CI does not run browser tests. Current release-QA work is more rigorous and separately controlled. |
| 57 | Basic architecture documentation | Already implemented | Current repository contains extensive product, control, migration, security, and implementation documentation. |
| 58 | Foundation README/setup guide | Already implemented | Current repository documentation is tied to the actual deployed architecture. |
| 59 | Customer dashboard showing service balance | Already implemented | Current dashboard reconciles available and held minutes with live subscriptions and bookings. |
| 60 | Service browsing page | Already implemented | Current catalogue and guided booking are materially richer. |
| 61 | Booking request page | Already implemented | Current booking RPC, address, duration, matching, preferred providers, and balance reservation exceed the package placeholder. |
| 62 | Activity/history page | Already implemented | Current booking history, notifications, reviews, photos, and repeat booking exceed the package. |
| 63 | Account page | Already implemented | Current profile, billing, phone, auth, and subscription controls exceed the package. |
| 64 | Accessible semantic HTML baseline | Partially implemented | Current application includes established accessibility work; comprehensive WCAG/viewport QA remains in PR #64 and was not duplicated. |
| 65 | Production monitoring | Missing | The package does not actually implement Sentry or equivalent monitoring despite architectural references; no patch available to port. |
| 66 | Email/SMS notifications | Already implemented | Current repository includes in-app, email, SMS, and scheduled dispatch infrastructure. |

## Applied patch

1. Replaced the dead `next lint` command with a pinned Biome 2.2.4 lint invocation over `app`, `components`, and `lib`.
2. Added a `verify` script covering typecheck, lint, tests, and production build.
3. Added `biome.json` with repository-compatible rules.
4. Added `npm run lint` to GitHub Actions after typecheck.
5. Added `permissions: contents: read` to the CI workflow.

## Explicitly preserved

- JWT-bound Stripe Checkout from PR #60.
- Embedded Stripe Connect onboarding and hosted fallback from PR #57.
- Current Supabase migrations, RLS, Edge Functions, and security verification.
- Current provider, booking, dispatch, notification, payout, and admin functionality.
- Existing `package-lock.json`; no dependency graph was changed.

## Verification requirement

The reconciliation is acceptable only after GitHub Actions proves:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Until the exact branch head passes those checks, status remains **HOLD**.
