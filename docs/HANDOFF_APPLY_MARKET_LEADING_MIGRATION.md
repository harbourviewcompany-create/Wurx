# Handoff: Apply market-leading migration to production

**Status:** Build/types fixed on `main` (`7dcfcab`). CI green. Vercel production READY.  
**Remaining:** Apply SQL + storage + SMS wiring so runtime matches PR #47 features.

**Audience:** Claude / coding agent with Supabase CLI or dashboard access.

**This PR only adds this doc.** Merging does not apply the migration. You must run against live Supabase, then comment results on [PR #48](https://github.com/harbourviewcompany-create/Wurx/pull/48).

---

## Context

| Item | Value |
|------|--------|
| Repo | https://github.com/harbourviewcompany-create/Wurx |
| Branch base | `main` @ `7dcfcab864d1ffb7b9cc15b7aa983485db7eaea5` |
| Migration | `supabase/migrations/20260728150000_wurx_market_leading.sql` |
| **Production project-ref** | `rzdavbuoisckvdapbcbj` |
| Project URL | https://rzdavbuoisckvdapbcbj.supabase.co |
| Dashboard | https://supabase.com/dashboard/project/rzdavbuoisckvdapbcbj |
| What broke | PR #47 shipped schema + UI; `lib/database.types.ts` was not regenerated → typecheck failed |
| What was fixed | Types synced on main; CI run 110 success; Vercel `dpl_61tAczmyoC9GKu4U3Y9cPM1EZTnt` READY |

Without the migration on production, selects/inserts on `window_end` / `booking_photos` / SMS columns fail at the database even though the app compiles.

**Confirm with owner that `rzdavbuoisckvdapbcbj` is still production** before pushing.

---

## Goal (ordered)

1. **Pre-check** whether migration objects already exist (avoid blind re-apply).
2. Apply `20260728150000_wurx_market_leading.sql` if needed.
3. Drop stale **7-arg** `request_booking` overload if still present.
4. Create **`job-photos`** storage bucket + policies (not in migration).
5. Verify schema + RPC + storage.
6. (Feature-complete) Twilio secrets + redeploy `send-notifications` if SMS required.
7. Smoke-test; comment report on PR #48.
8. Optional: regenerate types.

---

## What this migration changes (exact)

Source: `supabase/migrations/20260728150000_wurx_market_leading.sql`

| Change | Detail |
|--------|--------|
| `bookings.window_end` | `timestamptz` nullable; exclusive end of arrival window |
| `booking_photos` | New table + index + RLS (select/insert) + grants |
| `notifications.sms_pending` | `boolean not null default false` |
| `notifications.sms_sent_at` | `timestamptz` nullable |
| `notify_user(...)` | Replaced; sets `sms_pending` for `booking_started`, `booking_confirmed`, `booking_completed`, `offer_accepted` |
| `start_booking(...)` | Replaced; clearer “pro en route” copy |
| `request_booking(...)` | Replaced; 8th arg `p_window_end timestamptz default null`; writes `window_end` |

**Idempotent pieces:** `add column if not exists`, `create table if not exists`, `create index if not exists`, `drop policy if exists` then recreate.  
**Not purely additive:** `create or replace function` for `notify_user`, `start_booking`, `request_booking`.

**Not in this migration (handle separately below):**

- Storage bucket `job-photos` + storage RLS policies
- Drop of old 7-parameter `request_booking` overload
- Twilio / Resend secrets
- Redeploy of edge function `send-notifications`

**Read the full migration file before running.** Do not invent alternate SQL. Do not partial-apply.

---

## Preflight

1. Confirm target is **production** project-ref `rzdavbuoisckvdapbcbj` (not local/staging).
2. Ensure Owner/admin access on that project.
3. Optional safety: note PITR / take a backup before function replaces.
4. Clone clean `main`:

```bash
git clone https://github.com/harbourviewcompany-create/Wurx.git
cd Wurx
git checkout main && git pull
ls supabase/migrations/20260728150000_wurx_market_leading.sql
```

5. CLI login:

```bash
npm i -g supabase   # or npx supabase
supabase login
supabase link --project-ref rzdavbuoisckvdapbcbj
```

### Pre-check: already applied?

Run **before** `db push`:

```bash
supabase migration list
```

And/or in SQL Editor:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings' and column_name = 'window_end';

select to_regclass('public.booking_photos');

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'notifications'
  and column_name in ('sms_pending', 'sms_sent_at');
```

| Result | Action |
|--------|--------|
| All present + migration listed remote | Skip Path A/B apply; still do overload + storage + SMS checks |
| Missing objects | Apply via Path A or B |
| History says applied but objects missing | Path C |

---

## Execution steps

### Path A — Supabase CLI (preferred)

```bash
supabase link --project-ref rzdavbuoisckvdapbcbj
supabase migration list
supabase db push
```

- Expected: applies `20260728150000_wurx_market_leading` if pending.
- If already up to date: CLI reports nothing to push.
- If `db push` fails on an **earlier** migration: **stop** and report — do not skip versions.

Optional after success:

```bash
supabase db diff --linked
# Prefer empty or only unrelated drift
```

### Path B — Dashboard SQL Editor (fallback)

1. https://supabase.com/dashboard/project/rzdavbuoisckvdapbcbj → **SQL Editor** → New query.
2. Paste **entire** `supabase/migrations/20260728150000_wurx_market_leading.sql`.
3. Run once.
4. If success and history row missing, try recording (columns vary by CLI version):

```sql
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260728150000',
  'wurx_market_leading',
  array['applied via dashboard — see repo migration file']
)
on conflict do nothing;
```

If insert fails, note “applied via dashboard” on PR #48 and leave history to the team.

### Path C — History vs objects mismatch

```bash
supabase migration list
```

If remote shows applied but verify SQL fails → re-run full migration SQL via Path B → re-verify.  
Do **not** `migration repair` unless you understand local/remote version tables.

### Drop old `request_booking` overload (required check)

Postgres keeps multiple overloads. Migration grants the **8-arg** form; a **7-arg** form may remain and can still be chosen by PostgREST/clients that omit `p_window_end` — then `window_end` is never written.

```sql
-- List all overloads
select p.oid::regprocedure, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'request_booking';
```

If a 7-arg version exists (no `p_window_end`), drop it **after** confirming the 8-arg version exists:

```sql
-- Adjust argument types to match the listed 7-arg identity exactly
drop function if exists public.request_booking(
  uuid, timestamptz, int, text, text, text, text
);
```

Re-grant is already in the migration for the 8-arg form; if needed:

```sql
revoke all on function public.request_booking(uuid, timestamptz, int, text, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.request_booking(uuid, timestamptz, int, text, text, text, text, timestamptz)
  to authenticated;
```

### Storage: `job-photos` bucket + policies (required for photos)

App code (`components/CompleteBookingButton.tsx`):

- Uploads to `storage.from('job-photos')` at path `{bookingId}/{timestamp}-{filename}`
- Inserts `booking_photos` with `storage_path` = that path
- Upload is best-effort; **complete still runs** if upload fails — so missing bucket looks like “photos never appear,” not a hard error

**Create bucket (Dashboard or SQL):**

Dashboard → **Storage** → New bucket:

- Name: `job-photos`
- **Private** (not public)
- File size limit: e.g. 10MB
- Allowed MIME: `image/*`

Or SQL (service role / dashboard):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

**Storage policies** (authenticated upload/read for own booking paths — adjust if product needs signed URLs only):

```sql
-- Providers/customers can upload under their booking folder (path starts with booking uuid)
drop policy if exists "job_photos_upload_authenticated" on storage.objects;
create policy "job_photos_upload_authenticated"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] in (
    select b.id::text from public.bookings b
    left join public.providers p on p.id = b.provider_id
    where b.user_id = auth.uid() or p.user_id = auth.uid()
  )
);

drop policy if exists "job_photos_select_authenticated" on storage.objects;
create policy "job_photos_select_authenticated"
on storage.objects for select to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] in (
    select b.id::text from public.bookings b
    left join public.providers p on p.id = b.provider_id
    where b.user_id = auth.uid()
       or p.user_id = auth.uid()
       or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
);
```

If policy SQL fails on `storage.foldername`, use Dashboard policy UI with equivalent path checks, or signed-URL-only flow.

---

## Verify (after apply)

```sql
-- 1) window_end
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'bookings' and column_name = 'window_end';
-- expect: window_end | timestamp with time zone | YES

-- 2) booking_photos columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'booking_photos'
order by ordinal_position;
-- expect: id, booking_id, uploaded_by, storage_path, caption, created_at

-- 3) RLS on
select relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'booking_photos';

-- 4) table policies
select polname, polcmd from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'booking_photos';

-- 5) SMS columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications'
  and column_name in ('sms_pending', 'sms_sent_at');

-- 6) Exactly one request_booking overload, with p_window_end
select p.oid::regprocedure, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'request_booking';
-- expect: single row; args include p_window_end timestamp with time zone

-- 7) Migration history
select version, name from supabase_migrations.schema_migrations
where version like '20260728150000%' or name ilike '%market_leading%';

-- 8) Storage bucket
select id, public, file_size_limit from storage.buckets where id = 'job-photos';
```

---

## SMS feature path (schema alone is not enough)

`notify_user` sets `sms_pending` for key kinds. Drain is in edge function `supabase/functions/send-notifications` (cron every 2 min via `dispatch_send_notifications`).

### Secrets (via `get_app_secret` / app secrets table — same pattern as Resend)

| Secret | Purpose |
|--------|--------|
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_FROM_NUMBER` | E.164 from number |
| `NOTIFY_DISPATCH_SECRET` | Already used by cron → function |
| `RESEND_API_KEY` | Email drain (existing) |

If Twilio secrets are missing, the function **clears `sms_pending` and no-ops** (safe; no SMS).

### Profiles need `phone`

SMS uses `profiles.phone`. Empty/invalid → skipped. Ensure test users have E.164-capable numbers.

### Redeploy edge function if prod is behind repo

Repo `send-notifications/index.ts` drains both email and SMS. If production function is older (email-only), after columns exist:

```bash
supabase functions deploy send-notifications --project-ref rzdavbuoisckvdapbcbj
```

Confirm cron still scheduled (`wurx-send-notifications` every `*/2`).

**Out of scope unless owner asks:** buying Twilio numbers, compliance, or changing copy.

---

## Optional: regenerate types

```bash
supabase gen types typescript --linked > lib/database.types.ts
npm run typecheck
```

If green and diff is real schema (not noise):

```bash
git checkout -b chore/regen-types-after-market-leading
git add lib/database.types.ts
git commit -m "chore: regenerate database.types from live schema after market-leading migration"
git push -u origin HEAD
# open PR to main
```

Main already has a hand-synced types fix; regen is hygiene, not a blocker.

---

## Smoke test (manual)

1. Customer: book with a **time window** → `bookings.window_end` set (default start+2h if UI omits).
2. Provider: **Start job** on confirmed → notification “is on the way”; `sms_pending` true for that kind when SMS wired.
3. Provider: complete with after-photo → `booking_photos` row + object in `job-photos/{bookingId}/...`.
4. Customer dashboard bookings list loads without column/PostgREST errors.
5. (If Twilio configured) notification eventually has `sms_sent_at` and `sms_pending = false`.

---

## Report back on PR #48

Comment with this template:

```markdown
### Migration handoff report

- [ ] Pre-check: already applied? yes/no
- [ ] `db push` / dashboard SQL: success / skipped / failed (paste error)
- [ ] `window_end` present
- [ ] `booking_photos` + RLS policies
- [ ] `sms_pending` / `sms_sent_at` present
- [ ] `request_booking` overloads: count = _ ; includes `p_window_end`
- [ ] Old 7-arg overload dropped (or never existed)
- [ ] `job-photos` bucket exists + policies applied
- [ ] Twilio secrets present? yes/no/skipped
- [ ] `send-notifications` redeployed? yes/no/skipped
- [ ] Smoke: book window / start job / complete+photo

Notes:
```

---

## Rollback notes

Prefer forward fix.

| Object | Notes |
|--------|--------|
| Columns `window_end`, `sms_*` | Dropping loses data |
| `booking_photos` | Drop only if empty / product ok |
| Functions | Restore bodies from earlier files under `supabase/migrations/` |
| Storage bucket | Empty then delete bucket if reverting photos |

Do **not** delete `schema_migrations` rows unless coordinating a controlled repair.

---

## Do not

- Rewrite or “improve” the migration SQL
- Apply only fragments
- Target a non-prod project without explicit human confirmation
- Force-push or casually reset migration history
- Change app code unless verify shows a real post-apply mismatch
- Skip verify queries after a “successful” run
- Assume SMS works from schema alone
- Redeploy **other** edge functions from repo without checking they match live (billing functions have historically drifted)

---

## Success criteria

**Minimum (no DB 500s on new features):**

- [ ] Migration on production (history or documented dashboard apply)
- [ ] `bookings.window_end` exists
- [ ] `booking_photos` exists with RLS
- [ ] `notifications.sms_pending` / `sms_sent_at` exist
- [ ] Single `request_booking` overload includes `p_window_end`
- [ ] Book + start + complete work against live DB

**Photos:**

- [ ] `job-photos` bucket + storage policies; after-photo lands in storage + `booking_photos`

**SMS (optional product slice):**

- [ ] Twilio secrets set; `send-notifications` drains SMS; test user has `profiles.phone`

**Hygiene:**

- [ ] Report comment on PR #48
- [ ] (Optional) Types regenerated; follow-up PR CI green

---

## Links

- Types fix: https://github.com/harbourviewcompany-create/Wurx/commit/7dcfcab864d1ffb7b9cc15b7aa983485db7eaea5
- CI success: https://github.com/harbourviewcompany-create/Wurx/actions/runs/30371684567
- Vercel prod: https://vercel.com/wurx/wurx/61tAczmyoC9GKu4U3Y9cPM1EZTnt
- This PR: https://github.com/harbourviewcompany-create/Wurx/pull/48
- Supabase project: https://supabase.com/dashboard/project/rzdavbuoisckvdapbcbj

## Human inputs

- Confirm `rzdavbuoisckvdapbcbj` is still production
- Twilio credentials if SMS must work in this pass
- Whether to redeploy `send-notifications` now or schema-only

**Start:** Pre-check → Path A or B if needed → drop old RPC overload → `job-photos` bucket/policies → verify SQL → (optional SMS) → smoke test → report comment on PR #48.
