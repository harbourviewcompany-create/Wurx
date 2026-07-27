# Wurx — Customer funnel & implementation playbook

This is the source of truth for shipping a **low-friction path** from first visit
to first completed booking, and for sequencing remaining production work.

Use this doc before opening feature PRs so we do not re-discover routes, break
the money path, or ship UI that dead-ends.

---

## 1. Ideal happy path (target)

```
Land → Choose plan (slug in state) → Auth (if needed, plan preserved)
    → Stripe Checkout → Dashboard (balance + Book)
    → Book service → Offer dispatch → Pro accepts → Complete → Review
```

| Step | Target UX | Current code | Gap |
|------|-----------|--------------|-----|
| **Land** | Primary CTA = choose plan | `app/page.tsx` → `/signup` (“Get started”) | CTA should be `#plans` or `/pricing?plan=` |
| **Plans on home** | Choose {plan} deep-links with slug | Links only to `/pricing` | Pass `?plan=home` (etc.) |
| **Pricing** | Checkout or signup-with-plan | `PlanCheckoutButton` → unauthed goes `/login?redirect=/pricing` | Preserve `priceId` / `plan` slug through auth |
| **Signup** | After session → checkout if plan chosen | Always `/dashboard` | Read `?plan=` / `?priceId=` → invoke checkout or redirect pricing |
| **Login** | Same redirect chain | `?redirect=` exists | Support `/pricing?plan=` and post-login auto-checkout |
| **Checkout** | Stripe session for that price | Edge `create-checkout` | Keep server-side price lookup; success_url dashboard |
| **Dashboard (no sub)** | Activation → Choose plan | Already good | Optional: preselect plan from query |
| **Dashboard (active)** | Balance + Book primary | Already good | First-run empty bookings CTA is clear |
| **Book** | Service → time → address → confirm + minutes | `app/dashboard/book` | Ensure profile address prefill |
| **Dispatch** | Multi-offer or claim | PR #29 fan-out notifs; PR #30 multi-offer (if open) | Merge + apply migrations |

---

## 2. Key files (do not reinvent)

| Concern | Location |
|---------|----------|
| Marketing / home | `app/page.tsx` |
| Pricing + features copy | `app/pricing/page.tsx` |
| Stripe subscribe button | `components/PlanCheckoutButton.tsx` |
| Signup | `app/signup/page.tsx` |
| Login | `app/login/page.tsx` |
| Auth callback | `app/auth/callback/route.ts` |
| Customer dashboard | `app/dashboard/page.tsx` |
| Book flow | `app/dashboard/book/page.tsx` |
| Checkout edge fn | `supabase/functions/create-checkout` |
| Webhook / minute grants | `supabase/functions/stripe-webhook` |
| Billing portal | `components/ManageSubscriptionButton.tsx` + `billing-portal` fn |
| DB types / RPCs | `lib/database.types.ts` |
| Format helpers | `lib/format.ts` |
| Production status | `docs/PRODUCTION_READINESS.md` |

**Rule:** When adding an RPC, update `lib/database.types.ts` in the same PR or
CI/`tsc` fails (see multi-offer type miss).

---

## 3. Funnel implementation tickets (ordered)

### F1 — Preserve plan through auth (highest ROI)

1. Home plan buttons: `href={`/pricing?plan=${p.slug}`}`.
2. Home primary CTA: “Choose a plan” → `/pricing` (or `#plans` on same page).
3. `PlanCheckoutButton`: if `!isAuthed`, go  
   `/signup?plan=${slug}&priceId=${priceId}` (or login with same query).
4. Signup success with session: if `priceId` present, invoke `create-checkout`
   then redirect to Stripe; else `/dashboard`.
5. Login: honor `redirect` **and** optional `priceId` to auto-start checkout
   after session.

Acceptance: unauthenticated user can tap **Choose Home** and end on Stripe with
Home selected without re-picking the plan.

### F2 — Plan card clarity (copy only)

On home + pricing cards add:

- Effective rate: `price_cents / (monthly_minutes/60)` as “~$X/h of service time”.
- One job example per plan (Starter / Home / Plus).
- Microcopy under CTA: “Account + secure checkout — cancel anytime.”

### F3 — Post-checkout first run

- Stripe success_url already → dashboard; ensure activation vs active branch
  still correct after webhook lag (optional “minutes arriving…” state if
  balance 0 and sub just created).

### F4 — Book path polish

- Prefill address from `profiles`.
- Show estimated minutes before confirm (use service multiplier if present).

### F5 — Provider side (parallel track)

- Merge Phase 2 provider ops (pending + compliance) and multi-offer UI.
- Apply SQL migrations on live.
- Verify: book → offers/notifications → accept → complete → earnings.

---

## 4. Production readiness sequence

Do **owner dashboard tasks** before heavy funnel UI, or signup remains broken.

### Blockers (you / dashboard only)

1. **Supabase Auth** — Site URL `https://wurx.vercel.app`, redirect URLs include
   `/auth/callback`, SMTP (or disable confirm for launch). Without this, new
   users never get a session.
2. **Live subscribe test** — one real Checkout on production; confirm
   `hour_ledger` grant.
3. **Branch protection** — fix required checks that nothing produces (blocks merges).
4. **Node 22** on Vercel project + merge **PR #31** (main-only deploys).
5. Rotate any live keys that were exposed in chat.

### Merge order for open work

| Priority | PR / work | Why |
|----------|-----------|-----|
| 0 | Fix branch protection | Unblocks everything |
| 1 | PR #31 Vercel config | Quiet, deterministic deploys |
| 2 | PR #13 account recovery (rebase if needed) | Signup/reset depend on SMTP but code must land |
| 3 | PR #29 Phase 2 provider ops | Pending apps + compliance |
| 4 | Multi-offer dispatch (+ types) | Provider accept/decline |
| 5 | **F1–F4 funnel PRs** | Conversion path |

Rebase long-lived branches onto current `main` before merge (`#29` base may be stale).

### After each merge

- [ ] CI green (`typecheck`, `test`, `build`)
- [ ] If SQL migration: `supabase db push` (or apply listed files) on live
- [ ] If new RPC: `database.types.ts` updated
- [ ] Smoke: login → dashboard; pricing → checkout invoke (no 500)

---

## 5. Engineering rules (keep the platform healthy)

1. **Money path is sacred** — `create-checkout` + `stripe-webhook` + ledger RPCs.
   Never trust client amounts; only Stripe price ids.
2. **SECURITY DEFINER RPCs** must re-check `auth.uid()` / admin; revoke `anon` execute.
3. **Types with migrations** — any new function/table column → `lib/database.types.ts`.
4. **No preview spam** — only `main` auto-deploys (vercel.json `deploymentEnabled`).
5. **CI is the preview** — `npm ci` + typecheck + vitest + `next build` on PRs.
6. **Small PRs** — funnel copy vs checkout redirect vs provider SQL stay separate
   when possible so reverts are safe.
7. **Test economics in vitest** — multipliers, holds, fee bps; extend when changing SQL math.

---

## 6. Smoke checklist (production)

```
[ ] Signup or login receives session (SMTP/confirm OK)
[ ] /pricing → Choose Home → Stripe Checkout opens
[ ] Pay test/live → return to /dashboard with balance > 0
[ ] Book a service → status requested, minutes held
[ ] Provider sees offer/notification → accept/claim
[ ] Complete booking → minutes consumed, earnings row
[ ] Customer can Manage subscription (portal)
[ ] Cancel booking releases hold
```

---

## 7. What “done” looks like for the funnel

A stranger on mobile can:

1. Open wurx.vercel.app  
2. Tap **Choose Home**  
3. Create account (or log in) without losing Home  
4. Complete Stripe  
5. Land on dashboard with minutes  
6. Tap **Book a service** and submit one job  

…in one sitting, without opening the menu to hunt for pricing.
