import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260731130000_wurx_atomic_payout_batches.sql',
    import.meta.url,
  ),
  'utf8',
)
const edge = readFileSync(
  new URL('../supabase/functions/provider-payouts/index.ts', import.meta.url),
  'utf8',
)

describe('atomic provider payout batches', () => {
  it('claims earnings before Stripe and reuses unresolved batches', () => {
    expect(migration).toContain('create or replace function public.claim_provider_payout_batch')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("status in ('pending', 'transferring', 'failed', 'reconciliation_required')")
    expect(migration).toContain('update public.provider_earnings')
    expect(migration).toContain('set payout_id = v_batch_id')
  })

  it('uses one durable Stripe idempotency key per batch', () => {
    expect(migration).toContain("v_key := 'wurx-payout-' || v_batch_id::text")
    expect(migration).toContain('provider_payouts_idempotency_key_uidx')
    expect(edge).toContain('{ idempotencyKey: batch.idempotency_key }')
    expect(edge).toContain('wurx_payout_batch_id: batch.batch_id')
  })

  it('finalizes the batch and earnings in one database transaction', () => {
    expect(migration).toContain('create or replace function public.finalize_provider_payout_batch')
    expect(migration).toContain("status = 'paid'")
    expect(migration).toContain('set paid_out_at = coalesce(paid_out_at, now())')
    expect(edge).toContain("'finalize_provider_payout_batch'")
  })

  it('quarantines ambiguous Stripe outcomes and blocks automatic retries', () => {
    expect(edge).toContain('isExplicitStripeRejection')
    expect(edge).toContain('reconciliationRequired: !explicitRejection')
    expect(edge).toContain("batch.batch_status === 'reconciliation_required'")
    expect(edge).toContain('retrySafe: false')
    expect(migration).toContain("status in ('pending', 'failed', 'transferring')")
    expect(migration).not.toContain("'pending', 'failed', 'reconciliation_required', 'transferring'")
  })

  it('keeps explicit provider rejections retryable without releasing earnings', () => {
    expect(edge).toContain('Stripe rejected the transfer before completion')
    expect(edge).toContain('retrySafe: true')
    expect(edge).not.toContain(".is('payout_id', null)\n")
  })

  it('makes a recorded Stripe transfer id immutable', () => {
    expect(migration).toContain('prevent_provider_payout_transfer_id_mutation')
    expect(migration).toContain(
      'new.stripe_transfer_id is distinct from old.stripe_transfer_id',
    )
    expect(migration).toContain(
      'Provider payout Stripe transfer id is immutable once recorded',
    )
    expect(migration).toContain(
      'stripe_transfer_id is null\n      or stripe_transfer_id = p_stripe_transfer_id',
    )
  })

  it('records ambiguous and post-transfer failures as reconciliation required', () => {
    expect(migration).toContain('p_reconciliation_required boolean default false')
    expect(migration).toContain(
      'when p_reconciliation_required or p_stripe_transfer_id is not null',
    )
    expect(edge).toContain('Operator reconciliation is required before any retry.')
    expect(edge).toContain('Transfer exists but local finalization requires reconciliation.')
  })

  it('exposes payout mutation RPCs only to the service role', () => {
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration).toContain(
      'grant execute on function public.claim_provider_payout_batch(uuid, uuid) to service_role',
    )
    expect(migration).toContain(
      'grant execute on function public.finalize_provider_payout_batch(uuid, text) to service_role',
    )
    expect(migration).toContain(
      'grant execute on function public.mark_provider_payout_issue(uuid, text, text, boolean) to service_role',
    )
  })
})
