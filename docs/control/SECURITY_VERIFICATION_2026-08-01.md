# Wurx Security Verification Record

**Project:** Wurx  
**Repository:** `harbourviewcompany-create/Wurx`  
**Verification date:** 2026-08-01  
**Scope:** Supabase Edge Function hardening and endpoint verification  
**Final status:** **GO**

## Objective

Verify that temporary operational endpoints are retired, public endpoints enforce their intended security boundaries, and all synthetic verification data is removed without changing production application code.

## Edge Function hardening

The following temporary GitHub helper functions are retired behind Supabase JWT verification and return HTTP `410 Gone` for authorized requests.

| Function | Final version | `verify_jwt` | Final SHA-256 |
| --- | ---: | :---: | --- |
| `gh-push` | 2 | true | `d568eef85894d3a56399bd814a9f3f0e2670854af5f981fde41f56c3078ff1c1` |
| `gh-push-icons` | 2 | true | `afdb9145b4bfdf9e3ede1af3b0c2c930c9280423f922e675929d2a1d698433d8` |
| `gh-push-release` | 2 | true | `ee147cb890220791cca7f315bdb21918e4a6a8961d030167bd0dd129f88a989d` |
| `gh-push-types` | 2 | true | `22330e081bd01ed0003190adc85553874768ecfde379962cd2995048d7272faa` |
| `gh-list-prs` | 2 | true | `260490553003511e8fb4c906b1f4777b14bd757f104d2ff97efb7bc1853574ed` |
| `gh-close-pr48` | 2 | true | `aae0283e51271c8900d8cef62e7fc6aab2a9cd8463f72c90e9cd24f2ade23715` |
| `gh-push-payouts-errmsg` | 2 | true | `d6ef513e89af963c9a09ba3a5f3e26a2d1be652cd4e0430c1bfe3f1e5395e9ef` |

Additional retired diagnostic functions verified during the same pass:

| Function | Final version | `verify_jwt` | Final SHA-256 |
| --- | ---: | :---: | --- |
| `gh-diag` | 2 | true | `77a088d422635b39181167cd4e0b47a9f38fc849ab51779048fd042b7d9b60f1` |
| `stripe-diag` | 2 | true | `ddec92c6cfaa05eb5f57836d7ec8ff1a67979337ee3a754b6fe56882e7c34aea` |
| `auth-settings-check` | 2 | true | `64ebf74b41f7e82824c2e3e5ec77a1f0a90e89efb38983c9489fd32baaa30ac1` |
| `stripe-testmode-verify` | 4 | true | `0bede980b849f97565ece54f433ebedb8e8e35477b1c8763a5373d361d94efd1` |

## Operational Edge Functions

| Function | Version | `verify_jwt` | Security boundary | SHA-256 |
| --- | ---: | :---: | --- | --- |
| `stripe-webhook` | 3 | false | Stripe signature verification using a Vault-backed signing secret | `3a9937ddb34c6a47084a6e5a5c6dfd4c69dd283c1a994c27d2750282e084fa24` |
| `send-notifications` | 10 | false | Vault-backed `X-Dispatch-Secret`; missing, empty, or unreadable secret returns `503` before queue access | `7c4fc12aa4f9670fdfcd0cb117392e5f6d0310de3975e0ed255bea038751ded1` |
| `wurx-lead-notify` | 3 | false | Explicit origin allowlist, request-size limits, strict validation, HTML escaping, and database-backed rate limiting | `cde6a4c8ad92610fbabddf15975feaf76325242077d41124ecef582bfec0338d` |

## Endpoint response matrix

| Verification case | Expected | Observed |
| --- | ---: | ---: |
| Retired GitHub helper without authorization | 401 | 401 |
| Retired GitHub helper with valid project JWT | 410 | 410 |
| Lead request from invalid origin | 403 | 403 |
| Lead request using `Content-Type: text/plain` | 415 | 415 |
| Lead request over 16 KiB | 413 | 413 |
| Nested field value | 400 | 400 |
| Unexpected field | 400 | 400 |
| Legitimate lead submission | 200 | 200 |
| Sixth matching submission within 15 minutes | 429 | 429 |
| Rate-limit `Retry-After` value | 900 seconds | 900 seconds |
| Notification dispatch with secret configured but header absent | 403 | 403 |
| Notification dispatch with secret unavailable | 503 | 503 |

The unsupported-media-type verification returned:

```json
{"error":"Content-Type must be application/json"}
```

## Lead endpoint controls

`wurx-lead-notify` enforces:

- Maximum request body: 16 KiB.
- POST requests with `application/json` only.
- Allowed origins:
  - `https://wurx.vercel.app`
  - `https://wurx.ca`
  - `https://www.wurx.ca`
- Scalar string fields only.
- Unexpected-field rejection.
- Email and telephone validation.
- Maximum field lengths.
- HTML escaping before notification rendering.
- SHA-256 rate-limit identity derived from client IP and normalized email.
- Five accepted requests per 15 minutes.
- Twenty accepted requests per 24 hours.
- HTTP `429` with `Retry-After` when limited.

## Database rate-limit controls

Migration applied:

```text
wurx_private_lead_rate_limit
```

Created objects:

```text
private_security.wurx_lead_rate_events
public.consume_wurx_lead_rate_limit(text)
```

Verified controls:

- Rate-limit table is in a private schema.
- Row-level security is enabled.
- `anon` and `authenticated` have no schema, table, or RPC access.
- `service_role` has the required access.
- The atomic RPC uses an advisory transaction lock to prevent concurrent bypass.
- The sixth atomic attempt is rejected with a 900-second retry interval.

## Cleanup evidence

Verified after testing:

- Remaining synthetic lead records: `0`.
- Remaining synthetic rate-limit events: `0`.
- Temporary HTTP test extension removed.
- Temporary secret-recovery function removed.
- Temporary encrypted backup table removed.
- Notification dispatch secret restored and non-empty.
- Post-restoration notification request without the dispatch header returned HTTP `403`.
- No production application code was changed during endpoint verification.

## Secret rotation requirements

### GitHub token

**Required.** Historical unauthenticated helper functions could retrieve and use the stored GitHub token through service-role access.

Required follow-up:

1. Revoke the historical token.
2. Issue a least-privilege replacement.
3. Store the replacement in Supabase Vault.
4. Review GitHub audit logs for unauthorized branches, commits, pull requests, merges, workflow changes, or token use.

### Stripe restricted test key

**Required.** A historical diagnostic function contained a hard-coded restricted test key. Revoke it and review test-mode activity for unexpected connected accounts, account links, customers, Checkout Sessions, subscriptions, invoices, or webhook endpoints.

### Production Stripe key

**Review required; rotation recommended unless historical activity can be conclusively validated.** A former public diagnostic function could use the production Stripe credential to create connected accounts, although it did not return the credential itself.

## Final decision

**GO**

The defined Supabase Edge Function security scope passed. Temporary GitHub helpers are retired, intended public boundaries are enforced, rate limiting is atomic, notification dispatch fails closed, the full endpoint response matrix is verified, and synthetic verification data and temporary recovery artifacts were removed.
