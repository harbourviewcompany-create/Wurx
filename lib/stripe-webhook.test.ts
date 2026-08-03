import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

const migration = read(
  '../supabase/migrations/20260731120000_wurx_stripe_event_inbox.sql',
)
const webhook = read('../supabase/functions/stripe-webhook/index.ts')
const processor = read(
  '../supabase/functions/_shared/stripe-event-processor.ts',
)
const replay = read('../supabase/functions/stripe-replay/index.ts')
const checkout = read('../supabase/functions/create-checkout/index.ts')

describe('durable Stripe event inbox', () => {
  it('persists verified events with retry, replay, and stale-claim recovery', () => {
    expect(migration).toContain('create table if not exists public.stripe_events')
    expect(migration).toContain("status in ('pending', 'processing', 'processed', 'failed')")
    expect(migration).toContain('create or replace function public.claim_stripe_event')
    expect(migration).toContain('attempts = attempts + 1')
    expect(migration).toContain("status = 'processing'")
    expect(migration).toContain("last_attempt_at < now() - interval '15 minutes'")
    expect(migration).toContain('create or replace function public.requeue_stripe_event')
  })

  it('acknowledges only successful or previously processed deliveries', () => {
    expect(webhook).toContain('await storeStripeEvent(supabase, event)')
    expect(webhook).toContain('await processStoredStripeEvent(supabase, event.id)')
    expect(webhook).toContain("state === 'in_progress'")
    expect(webhook).toContain('status: 503')
    expect(webhook).toContain("'Retry-After': '60'")
    expect(webhook).toContain('status: 500')
    expect(webhook).not.toContain('still ack so Stripe')
  })

  it('keeps duplicate deliveries retryable until a stale claim can recover', () => {
    expect(processor).toContain("return current.status === 'processed' ? 'already_processed' : 'in_progress'")
    expect(migration).toContain("last_attempt_at < now() - interval '15 minutes'")
    expect(webhook).toContain('retryable: true')
  })
})

describe('immutable commercial entitlements', () => {
  it('snapshots plans by Stripe Price and prevents mutation', () => {
    expect(migration).toContain(
      'create table if not exists public.stripe_price_entitlements',
    )
    expect(migration).toContain('stripe_entitlements_immutable')
    expect(migration).toContain(
      'Stripe price entitlements are immutable; create a new Stripe Price instead',
    )
  })

  it('grants minutes from the immutable mapping, not the mutable plans row', () => {
    expect(processor).toContain(".from('stripe_price_entitlements')")
    expect(processor).toContain('delta_minutes: entitlement.monthly_minutes')
    expect(processor).toContain('stripe_event_id: event.id')
    expect(checkout).toContain('stripe_price_id: priceId')
  })
})

describe('admin replay', () => {
  it('revalidates the caller and requires the admin role', () => {
    expect(replay).toContain('supabase.auth.getUser(token)')
    expect(replay).toContain("profile?.role !== 'admin'")
    expect(replay).toContain("'requeue_stripe_event'")
    expect(replay).toContain('processStoredStripeEvent(supabase, eventId)')
  })
})
