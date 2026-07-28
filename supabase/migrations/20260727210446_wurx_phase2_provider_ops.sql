-- Phase 2 provider ops:
-- Allow self-signup applications to land as verification = 'pending'
-- (was locked to 'unverified' only, so admin had no clear review queue).
--
-- NOTE: this migration originally also redefined on_booking_change() to fan
-- out a bare 'job_available' notification to every matching provider. That's
-- now redundant/conflicting with wurx_multi_offer_dispatch (merged separately,
-- already live), which redefines the same function to create formal
-- job_offers rows (status='offered') and sends a 'job_offer' notification per
-- provider -- a strict superset of what this migration's fan-out did. Kept
-- only the application-status change here to avoid clobbering that trigger.

drop policy if exists providers_insert_own on public.providers;
create policy providers_insert_own on public.providers
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_active = false
    and verification in ('unverified', 'pending')
  );
