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

## What this migration changes (exact)

Source: `supabase/migrations/20260728150000_wurx_market_leading.sql`

| Change | Detail |
|--------|--------|
| `bookings.window_end` | `timestamptz` nullable; exclusive end of arrival window |
| `booking_photos` | New table + index + RLS (select/insert) + grants |
| `notifications.sms_pending` | `boolean not null default false` |
| `notifications.sms_sent_at` | `timestamptz` nullable |
| `notify_user(...)` | Replaced; sets `sms_pending` for certain kinds |
| `start_booking(...)` | Replaced; clearer “pro en route” copy |
| `request_booking(...)` | Replaced; 8th arg `p_window_end timestamptz default null`; writes `window_end` |

**Idempotent pieces:** `add column if not exists`, `create table if not exists`, `create index if not exists`, `drop policy if exists` then recreate.  
**Not purely additive:** `create or replace function` for `notify_user`, `start_booking`, `request_booking` — replaces live function bodies/signatures.

**Not in this migration:** Storage bucket `job-photos` (app expects it; create separately in Dashboard → Storage if missing).

**Read the full file before running.** Do not invent alternate SQL. Do not partial-apply.

---

## Preflight

1. Confirm target is **production** (not local/staging). Get `project-ref` from owner or Supabase Dashboard → Project Settings → General.
2. Ensure you have Owner/admin on that project.
3. Optional safety: Dashboard → Database → take a backup / note PITR availability before function replaces.
4. From a clean clone of `main`:

```bash
git clone https://github.com/harbourviewcompany-create/Wurx.git
cd Wurx
git checkout main
git pull
# Confirm migration is present
ls supabase/migrations/20260728150000_wurx_market_leading.sql
```

5. Install / login CLI if using path A:

```bash
npm i -g supabase   # or use npx supabase
supabase login
```

---

## Execution steps

### Path A — Supabase CLI (preferred)

Tracks the migration in `supabase_migrations.schema_migrations` automatically.

```bash
# 1) Link production (replace ref)
supabase link --project-ref <PRODUCTION_PROJECT_REF>

# 2) See pending remote migrations (optional)
supabase migration list

# 3) Push local migrations that are not yet on remote
supabase db push

# Expected: applies 20260728150000_wurx_market_leading (and any other pending)
# If already applied, CLI should report nothing to push / already up to date
```

If `db push` fails on an earlier migration, **stop** and report — do not skip versions.

**Dry-run style check (optional):** compare remote schema after link with:

```bash
supabase db diff --linked
# Should be empty or only show unrelated drift after a successful push
```

### Path B — Dashboard SQL Editor (fallback)

Use only if CLI is unavailable. **Paste the entire file once** — not statements one-by-one unless a statement fails mid-run.

1. Open https://supabase.com/dashboard → select **production** project.
2. **SQL Editor** → New query.
3. Paste full contents of `supabase/migrations/20260728150000_wurx_market_leading.sql`.
4. Run.
5. If success, **manually record** the version so CLI history stays honest (recommended):

```sql
-- Only if you applied via SQL Editor and the row is missing
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260728150000',
  'wurx_market_leading',
  array['applied via dashboard — see repo migration file']
)
on conflict do nothing;
```

(Exact columns on `schema_migrations` can vary by CLI version; if insert fails, note “applied via dashboard” in the PR comment and leave history to the team.)

### Path C — Repair if CLI thinks it’s applied but objects are missing

```bash
supabase migration list
# If version shows as applied remotely but verify SQL fails:
# re-run the migration SQL via Path B, then re-verify.
# Do NOT `migration repair` unless you understand the local/remote version tables.
```

---

## Verify (run after apply)

```sql
-- 1) window_end column
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name = 'window_end';
-- expect: window_end | timestamp with time zone | YES

-- 2) booking_photos table + columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'booking_photos'
order by ordinal_position;
-- expect: id, booking_id, uploaded_by, storage_path, caption, created_at

-- 3) RLS enabled
select relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'booking_photos';
-- expect: true

-- 4) policies present
select polname, polcmd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'booking_photos';
-- expect: booking_photos_select, booking_photos_insert

-- 5) SMS columns on notifications
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
  and column_name in ('sms_pending', 'sms_sent_at');

-- 6) request_booking signature includes p_window_end
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'request_booking';
-- expect args ending with: ... p_window_end timestamp with time zone

-- 7) Migration history (CLI path)
select version, name
from supabase_migrations.schema_migrations
where version like '20260728150000%'
   or name ilike '%market_leading%';
```

### Storage (separate if needed)

This migration does **not** create the bucket. If photo upload fails after schema is good:

1. Dashboard → **Storage** → create bucket `job-photos` (private unless product requires public).
2. Add policies so authenticated providers/customers can upload/read paths for their bookings (match app upload code under `job-photos/...`).

---

## Optional: regenerate types

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

Only push if CI would stay green. Main already has a hand-synced types fix; regen is hygiene, not a blocker.

---

## Smoke test (manual)

1. Customer: book a service with a **time window** → `bookings.window_end` populated (default start+2h if UI omits).
2. Provider: **Start job** on confirmed booking → customer notification “is on the way” / en route copy; `sms_pending` true for that kind if SMS drain is wired.
3. Provider: complete with optional after-photo → row in `booking_photos`, file under Storage `job-photos`.
4. Customer dashboard bookings list loads without PostgREST/column errors.

---

## Rollback notes (if something breaks)

Prefer forward fix over destructive rollback.

| Object | Notes |
|--------|--------|
| Columns `window_end`, `sms_*` | Dropping loses data; only if deploy must revert and app no longer references them |
| `booking_photos` | `drop table` only if empty / product ok |
| Functions | Restore previous function bodies from prior migration files in `supabase/migrations/` |

Do **not** delete rows from `schema_migrations` unless coordinating a controlled repair.

---

## Do not

- Rewrite or “improve” the migration SQL
- Apply only fragments
- Target staging/dev without explicit human confirmation
- Force-push or reset migration history casually
- Change app code unless verify shows a real post-apply mismatch
- Skip verify queries after a “successful” run

---

## Success criteria

- [ ] Migration applied on production (CLI history or documented dashboard apply)
- [ ] `bookings.window_end` exists
- [ ] `booking_photos` exists with RLS policies
- [ ] `notifications.sms_pending` / `sms_sent_at` exist
- [ ] `request_booking` identity args include `p_window_end`
- [ ] Book + start + complete(+photo) work against live DB
- [ ] (Optional) Types regenerated; follow-up PR CI green
- [ ] (If photos used) `job-photos` bucket exists with usable policies

---

## Links

- Types fix commit: https://github.com/harbourviewcompany-create/Wurx/commit/7dcfcab864d1ffb7b9cc15b7aa983485db7eaea5
- CI (success): https://github.com/harbourviewcompany-create/Wurx/actions/runs/30371684567
- Vercel prod: https://vercel.com/wurx/wurx/61tAczmyoC9GKu4U3Y9cPM1EZTnt
- This PR: https://github.com/harbourviewcompany-create/Wurx/pull/48

## Human inputs required

- Production Supabase `project-ref` / access
- Explicit confirm this is **prod**, not staging
- SMS provider secrets are out of scope unless already set and you are only verifying columns

**Start:** Preflight → Path A (`supabase db push`) or Path B (full SQL once) → verify SQL → storage check if needed → smoke test → comment results on PR #48.
