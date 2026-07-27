# PR #13 remainder — cherry-pick playbook

**Source:** https://github.com/harbourviewcompany-create/Wurx/pull/13  
**Branch tip (do not merge):** `claude/supabase-vercel-review-orpbin` @ `a2d65d6`  
**Rule:** Close or supersede #13. Never merge the PR as a whole. Lift **unique** pieces onto current `main` in small PRs.

This document is the map for that work so we do not re-diff #13 or regress F1 / multi-offer / Option A design.

---

## 1. Already on `main` — skip entirely

| Feature | Where on main |
|---------|----------------|
| Forgot / reset password | `app/forgot-password/`, `app/reset-password/`, login link |
| Profile edit | `app/dashboard/profile/` (not `/account`) |
| `error.tsx`, `not-found.tsx` | `app/` |
| Favicon / OG / robots / sitemap | `app/icon.tsx`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts` |
| Static notifications feed | `components/NotificationsPanel.tsx` |

Do not re-add `/dashboard/account` or duplicate OG/icon files.

---

## 2. Unique remainder (do these)

Implement in **ticket order** R1 → R6. Each ticket = one PR when possible.

### R1 — `global-error.tsx` (safe, isolated)

| | |
|--|--|
| **Why** | Root layout failures currently have no branded fallback |
| **Source** | `app/global-error.tsx` from #13 |
| **Target** | `app/global-error.tsx` (new) |
| **Adapt** | Keep self-contained `<html>/<body>` styles. Prefer **Option A** colors (`--` tokens if available without layout CSS; else neutral light text on white, or navy `#0f172a` / orange accent — **not** the old purple gradient `#5b93ff`/`#a98bff` as the only brand). |
| **Do not touch** | `layout.tsx`, `globals.css` |
| **Test** | Manual: throw in a layout is hard; ensure file compiles under `next build` |

### R2 — Streaming skeletons (safe, isolated)

| | |
|--|--|
| **Why** | Dashboard and book are `force-dynamic`; blank frame on nav |
| **Source** | `app/dashboard/loading.tsx`, `app/dashboard/book/loading.tsx`, skeleton CSS block at end of #13 `globals.css` |
| **Target** | Same paths; **append only** skeleton rules to current `app/globals.css` |
| **Adapt** | Skeleton colors: use `rgba` on current light theme (e.g. soft gray shimmer), not dark-theme white-alpha. Keep `prefers-reduced-motion`. |
| **Do not** | Replace entire `globals.css` |
| **Test** | Slow network throttle → see skeleton then content |

### R3 — Realtime notifications

| | |
|--|--|
| **Why** | Claim/complete only visible after refresh |
| **Source** | `components/NotificationsPanel.tsx` (Realtime + poll fallback), call sites on dashboard + provider dashboard, migration `supabase/migrations/20260726120000_wurx_realtime_notifications.sql` |
| **Target** | Same files on current `main` |
| **Adapt** | 1) Keep #13 `userId` prop + channel filter. 2) Rebase against **multi-offer** provider dashboard (offers UI must remain). 3) Customer dashboard: pass `userId={user.id}` only — do not revert activation/ring layout. 4) Apply migration on live after merge. |
| **Verify live** | `select * from pg_publication_tables where tablename = 'notifications'` |
| **Test** | Two browsers: claim job → customer panel updates without refresh; on CHANNEL_ERROR falls back to 60s refresh |

### R4 — Resend confirmation (on top of F1)

| | |
|--|--|
| **Why** | Stalled signups when confirm email is on |
| **Source** | Resend button + state in #13 `app/signup/page.tsx` |
| **Target** | **Current** F1 signup (`feat/funnel-f1-preserve-plan` or `main` after #33 merges) |
| **Adapt** | Port **only** `resendConfirmation` + UI on the “Check your email” screen. Preserve all F1 `priceId` / `plan` query handling and checkout auto-start. Keep plan-aware login link. |
| **Do not** | Overwrite F1 signup with #13 signup |
| **Depends on** | #33 merged (or implement on F1 branch before merge) |
| **Test** | Signup with confirm-on → resend → no loss of `priceId` in login/checkout path |

### R5 — Profile polish (extend existing route)

| | |
|--|--|
| **Why** | Richer password change + plan card; single place for account |
| **Source** | `ChangePasswordCard`, pieces of `AccountForm` / account page |
| **Target** | **`app/dashboard/profile/`** only — never create `/dashboard/account` |
| **Adapt** | Read current profile page first. Add change-password card and optional plan summary / ManageSubscription if missing. Reuse or add `lib/profile.ts` helpers **if** not already present; otherwise wire tests only. Nav: link to `/dashboard/profile`, not `/account`. |
| **Do not** | Duplicate forms; fight F1 login/signup |
| **Test** | Edit name/address → booking prefill; change password while logged in |

### R6 — `send-notifications` hardening (optional, ops)

| | |
|--|--|
| **Why** | Silent empty queue / open endpoint if Vault unreadable |
| **Source** | #13 `supabase/functions/send-notifications/index.ts` |
| **Target** | Same path; **diff against deployed** function before overwrite |
| **Adapt** | Keep: multi-name service key resolve, fail-closed dispatch secret, `lastError` in response. Deploy with `supabase functions deploy`. |
| **Depends on** | Owner: verified Resend domain + Vault keys |
| **Test** | Invoke with bad secret → 403; with good secret → `pending`/`lastError` fields present |

### Skip from #13

- Full `layout.tsx` metadata rewrite (themeColor dark, old brand) — selectively add `metadataBase` / title template only if still missing, matching Option A  
- Skip-link: fine as tiny additive change in current layout (optional R2.5)  
- `apple-icon.tsx` / `manifest.ts` — optional later; brand colors to Option A  
- Entire PRODUCTION_READINESS rewrite from #13 — update bullets only when a ticket ships  

---

## 3. Source file map (cherry-pick reference)

```
#13 path                                              → main action
app/global-error.tsx                                  → ADD (R1)
app/dashboard/loading.tsx                             → ADD (R2)
app/dashboard/book/loading.tsx                        → ADD (R2)
app/globals.css (skeleton block only)                 → APPEND (R2)
components/NotificationsPanel.tsx                     → REPLACE carefully (R3)
app/dashboard/page.tsx (userId prop only)             → PATCH (R3)
app/provider/dashboard/page.tsx (userId prop only)    → PATCH (R3)
supabase/migrations/20260726120000_wurx_realtime_…    → ADD + apply (R3)
app/signup/page.tsx (resend only)                     → PATCH after F1 (R4)
components/ChangePasswordCard.tsx                     → ADD into profile (R5)
lib/profile.ts + lib/profile.test.ts                  → ADD if missing (R5)
supabase/functions/send-notifications/index.ts        → PATCH if needed (R6)
```

**Conflict magnets (never full-file take from #13):**

- `app/signup/page.tsx`, `app/login/page.tsx` → F1 owns these  
- `app/layout.tsx`, `app/globals.css` → Option A owns these  
- `app/provider/dashboard/page.tsx` → multi-offer owns structure  
- `app/dashboard/page.tsx` → activation ring owns structure  

---

## 4. Merge order vs other open work

```
1. Fix branch protection (CI job name `build`)
2. Merge #33 F1
3. Merge #32 funnel docs (optional)
4. Close #13 with comment linking this playbook
5. R1 → R2 → R3 → R4 → R5 → R6 as separate PRs (or R1+R2 together)
6. #29 provider ops (rebase) — independent of R*
```

---

## 5. Engineering rules

1. **Diff against `main`, not against #13 tip.** Open #13 files only as a recipe.  
2. **One concern per PR.** Realtime ≠ skeletons ≠ resend.  
3. **CI is the gate** (`npm run typecheck`, `test`, `build`). Not Vercel previews.  
4. **No new route `/dashboard/account`.** Extend `/dashboard/profile`.  
5. **Preserve query params** on any auth/signup change (`priceId`, `plan`, `redirect`).  
6. After R3 migration: confirm publication on live before claiming “live activity.”  

---

## 6. Smoke checklist (after each ticket)

| Ticket | Check |
|--------|--------|
| R1 | `next build` includes `global-error` |
| R2 | Navigate dashboard/book; skeleton appears under throttle |
| R3 | Second client sees notification; migration applied |
| R4 | Resend works; F1 still opens Stripe after session |
| R5 | Profile save + password change |
| R6 | Function response includes `lastError` / `pending` |

---

## 7. Close #13 comment (paste)

> Superseded by current `main` (#18 profile/password, #26 SEO/error, multi-offer, F1).  
> Remainder tracked in `docs/PR13_CHERRY_PICK.md` (R1–R6). Closing to avoid merge conflicts.
