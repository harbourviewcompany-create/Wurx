# Handoff: Apply market-leading migration to production

**Status:** Build/types fixed on `main` (`7dcfcab`). CI green. Vercel production READY.  
**Remaining:** Apply SQL to **live Supabase** so runtime matches the app.

**Audience:** Claude / coding agent with Supabase CLI or dashboard access.

---

## Context

| Item | Value |
|------|--------|
| Repo | https://github.com/harbourviewcompany-create/Wurx |
| Branch base | `main` @ `7dcfcab864d1ffb7b9cc15b7aa983485db7eaea5` |
| Migration | `supabase/migrations/20260728150000_wurx_market_leading.sql` |
| What broke | PR #47 shipped schema + UI; `lib/database.types.ts` was not regenerated → typecheck failed |
| What was fixed | Types synced on main; CI run 110 success; Vercel `dpl_61tAczmyoC9GKu4U3Y9cPM1EZTnt` READY |

Without the migration on production, selects/inserts on `window_end` / `booking_photos` / SMS columns fail at the database even though the app compiles.

---

## Goal

1. Apply `20260728150000_wurx_market_leading.sql` to the **production** Supabase project.
2. Verify columns/tables/RPC signature exist.
3. Optionally regenerate `lib/database.types.ts` from the linked project and open a follow-up commit if the diff is meaningful.
4. Smoke-test book-with-window and complete-with-photo.

---

## Migration source of truth

Path: `supabase/migrations/20260728150000_wurx_market_leading.sql`

**Read the full file before running.** Do not invent alternate SQL. Do not partial-apply.

Expected deltas (confirm against the file):

- `bookings.window_end` (`timestamptz`, nullable)
- Table `booking_photos` (`id`, `booking_id`, `uploaded_by`, `storage_path`, `caption`, `created_at`) + RLS
- Notification SMS fields if present (`sms_pending`, `sms_sent_at`)
- `request_booking` optional `p_window_end`
- Storage bucket / policies for `job-photos` if defined in the same migration

---

## Steps

### A. Apply migration (production only)

Confirm project-ref with the human if unsure.

```bash
# From repo root
supabase link --project-ref <PRODUCTION_PROJECT_REF>
supabase db push
# equivalent: supabase migration up --linked
```

**Fallback:** Supabase Dashboard → SQL Editor → paste **entire** migration file → run once.

### B. Verify

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name = 'window_end';

select to_regclass('public.booking_photos');

select pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'request_booking';
```

Also confirm the migration version appears in migration history (`supabase_migrations.schema_migrations` or Dashboard → Migrations).

### C. Optional: regenerate types

```bash
supabase gen types typescript --linked > lib/database.types.ts
npm run typecheck
```

If typecheck passes and the diff is schema-accurate (not noise):

```bash
git checkout -b chore/regen-types-after-market-leading
git add lib/database.types.ts
git commit -m "chore: regenerate database.types from live schema after market-leading migration"
git push -u origin HEAD
# open PR to main
```

Only push if CI would stay green.

### D. Smoke test (manual)

1. Customer: book with a **time window** → row has `window_end`.
2. Provider: mark complete with optional after-photo → `booking_photos` + storage under `job-photos`.
3. Dashboard bookings list loads without query errors.
4. SMS drain (if configured): `sms_pending` / send path behaves as designed.

---

## Do not

- Rewrite or “improve” the migration
- Apply only fragments
- Target staging/dev without explicit human confirmation
- Force-push or reset migration history
- Change app code unless verify shows a real post-`db push` mismatch

---

## Success criteria

- [ ] Migration applied on production (history recorded)
- [ ] `bookings.window_end` exists
- [ ] `booking_photos` exists with expected columns/RLS
- [ ] `request_booking` accepts `p_window_end` (if migration defines it)
- [ ] Book + complete flows work against live DB
- [ ] (Optional) Types regenerated; any follow-up PR CI green

---

## Links

- Types fix commit: https://github.com/harbourviewcompany-create/Wurx/commit/7dcfcab864d1ffb7b9cc15b7aa983485db7eaea5
- CI (success): https://github.com/harbourviewcompany-create/Wurx/actions/runs/30371684567
- Vercel prod: https://vercel.com/wurx/wurx/61tAczmyoC9GKu4U3Y9cPM1EZTnt

## Human inputs required

- Production Supabase `project-ref` / access
- Explicit confirm this is **prod**, not staging
- SMS provider secrets are out of scope unless already set and you are only verifying columns

**Start:** Read the migration file → confirm linked project → `db push` (or dashboard SQL once) → run verify queries → smoke test.
