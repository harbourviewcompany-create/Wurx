# Wurx Foundation Package Review

**Date:** 2026-08-02  
**Source package:** `wurx-foundation-v0.1.0.zip`  
**Source SHA-256:** `0aa76586ebc8abf136325b7348cf80b6914d2b994134bc1b1d48c3b2765e3213`  
**Target branch:** `feature/foundation`  
**Target repository:** `harbourviewcompany-create/Wurx`

## Decision

**HOLD — package not overlaid onto the current application.**

The existing `main` branch is materially ahead of the supplied foundation package. Replacing the current tree with the package would remove or regress production work, including hardened JWT-bound Stripe checkout, embedded Stripe Connect provider payout onboarding, current Supabase Edge Functions, security verification records, and other merged implementation.

The package was therefore treated as a foundation candidate for compatibility and architecture review, not as authority to replace newer repository state.

## Local package inspection

Archive extraction succeeded.

```text
wurx-foundation/
├── app/
├── components/
├── docs/
├── lib/
├── supabase/
├── .github/workflows/ci.yml
├── package.json
└── README.md
```

The extracted package contains 35 files.

## Environment

```text
node --version
v22.16.0

npm --version
10.9.2
```

## Installation result

Command:

```text
npm install
```

Result:

```text
npm error code E404
npm error 404 Not Found - GET https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/@playwright%2ftest
npm error 404 '@playwright/test@^1.55.0' is not in this registry.
```

This is an execution-environment registry limitation. It does not prove that the declared Playwright version is invalid in the public npm registry. No package version was changed without build evidence.

## Verification status

| Check | Status | Evidence |
| --- | --- | --- |
| ZIP extraction | PASS | 35 files extracted |
| Node runtime | PASS | Node 22.16.0 |
| npm runtime | PASS | npm 10.9.2 |
| Dependency installation | BLOCKED | Internal registry lacks `@playwright/test` |
| Typecheck | NOT RUN | Dependencies unavailable |
| ESLint | NOT RUN | Dependencies unavailable |
| Vitest | NOT RUN | Dependencies unavailable |
| Production build | NOT RUN | Dependencies unavailable |

## Repository-state conflict

Current `main` includes newer implementation commits, including:

- `69ea3331106ee6a498b27887768620fee5351f0a` — JWT-bound Stripe checkout authorization and contract tests.
- `8b1a8f3c45a5451fec255e63b45a12de404fa0c3` — embedded Stripe Connect provider payout onboarding.
- `f4cd3de8ea8a353cf7e61063b59ada1a623b7d3f` — Supabase Edge Function security verification record.

The foundation package's checkout endpoint creates subscription sessions without binding the request to an authenticated Supabase caller. Overlaying it would reintroduce a security defect already fixed on `main`.

## Required next action

Use current `main` as the implementation baseline. Compare the package's intended capabilities against the existing repository and port only demonstrably missing improvements through focused patches. Run `npm ci`, typecheck, lint, tests, and production build in GitHub Actions or another environment with public npm and Chromium access before changing release status.

## Final status

**HOLD**

Reason: the supplied package is older than the target repository and could not be fully verified in the available package registry. No production code was replaced or downgraded.
