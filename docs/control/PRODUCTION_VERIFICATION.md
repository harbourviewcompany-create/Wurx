# Wurx Production Verification

## Purpose

The `Production verification` GitHub Actions workflow validates the deployed production alias without creating users, bookings, subscriptions, payments, payouts, or database writes.

Production target:

```text
https://wurx.vercel.app
```

## Required GitHub Actions secrets

Configure both repository secrets under:

```text
GitHub repository → Settings → Secrets and variables → Actions → Repository secrets
```

Required names:

```text
DD_API_KEY
DD_APP_KEY
```

Use values created in the Wurx Datadog organization. Do not store either value in the repository, workflow YAML, pull-request text, issue text, logs, or Vercel environment variables.

The workflow fails before smoke or synthetic execution when either secret is absent. A skipped Datadog step must never be interpreted as a passing synthetic run.

## Datadog synthetic selection

The workflow executes Datadog tests matching:

```text
tag:e2e-tests
```

At least one enabled Datadog Synthetic test must use this tag and target the production alias. Datadog key permissions must allow the CI integration to locate and execute those tests.

## Non-destructive HTTP smoke coverage

The repository script `scripts/production-http-smoke.mjs` verifies:

Public HTML routes:

```text
/
/pricing
/login
/signup
```

Unauthenticated protected-route redirects:

```text
/dashboard
/provider/dashboard
/admin
```

Each protected route must redirect to `/login` and preserve its original path in the `redirect` query parameter.

The smoke script performs GET requests only. It does not submit forms, create accounts, call checkout, trigger Stripe, mutate Supabase, upload files, or invoke provider/admin actions.

## Interpretation

A valid production-verification result requires both of these steps to execute and pass:

1. Production HTTP smoke checks.
2. Datadog Synthetic tests.

A workflow that is green while either step is skipped is not valid release evidence.
