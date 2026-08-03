import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260731140000_wurx_notification_delivery_queue.sql',
    import.meta.url,
  ),
  'utf8',
)
const edge = readFileSync(
  new URL('../supabase/functions/send-notifications/index.ts', import.meta.url),
  'utf8',
)
const config = readFileSync(
  new URL('../supabase/config.toml', import.meta.url),
  'utf8',
)

describe('notification dispatcher authentication', () => {
  it('requires a non-empty dispatch secret and fails closed', () => {
    expect(edge).toContain("secret('NOTIFY_DISPATCH_SECRET')")
    expect(edge).toContain('!dispatchSecret.readable || !dispatchSecret.value')
    expect(edge).toContain('refusing to run')
    expect(edge).toContain('secureEqual(suppliedSecret, dispatchSecret.value)')
  })

  it('explicitly disables JWT only for mandatory shared-secret scheduling', () => {
    expect(config).toContain('[functions.send-notifications]')
    expect(config).toContain('[functions.send-notifications]\nverify_jwt = false')
  })
})

describe('atomic queue claims', () => {
  it('uses SKIP LOCKED and per-channel claim tokens', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('email_claim_token = p_claim_token')
    expect(migration).toContain('sms_claim_token = p_claim_token')
    expect(migration).toContain('email_attempts = n.email_attempts + 1')
    expect(migration).toContain('sms_attempts = n.sms_attempts + 1')
  })

  it('persists delivery start before the provider side effect', () => {
    expect(migration).toContain('create or replace function public.start_notification_delivery')
    expect(migration).toContain('email_delivery_started_at = now()')
    expect(migration).toContain('sms_delivery_started_at = now()')
    expect(edge).toContain("'start_notification_delivery'")
  })

  it('allows completion only by the worker holding the claim', () => {
    expect(migration).toContain('create or replace function public.complete_notification_delivery')
    expect(migration).toContain('email_claim_token = p_claim_token')
    expect(migration).toContain('sms_claim_token = p_claim_token')
    expect(edge).toContain("'complete_notification_delivery'")
  })
})

describe('crash recovery and duplicate-send prevention', () => {
  it('reclaims crashes that occur before provider delivery starts', () => {
    expect(migration).toContain('email_delivery_started_at is null')
    expect(migration).toContain("email_claimed_at < now() - interval '15 minutes'")
    expect(migration).toContain('sms_delivery_started_at is null')
    expect(migration).toContain("sms_claimed_at < now() - interval '15 minutes'")
  })

  it('quarantines crashes after provider delivery starts', () => {
    expect(migration).toContain(
      'create or replace function public.recover_stale_notification_deliveries',
    )
    expect(migration).toContain('email_delivery_started_at < now() - make_interval')
    expect(migration).toContain('sms_delivery_started_at < now() - make_interval')
    expect(migration).toContain(
      'Worker stopped after email delivery began; verify provider outcome before requeue',
    )
    expect(migration).toContain(
      'Worker stopped after SMS delivery began; verify provider outcome before requeue',
    )
    expect(edge).toContain('await recoverStaleDeliveries(supabase)')
    expect(edge).toContain("'recover_stale_notification_deliveries'")
    expect(edge).toContain('staleMovedToReconciliation: staleRecovered')
  })

  it('stops automatic resend after an ambiguous provider outcome', () => {
    expect(migration).toContain(
      'create or replace function public.mark_notification_delivery_reconciliation',
    )
    expect(migration).toContain('email_reconciliation_required = true')
    expect(migration).toContain('sms_reconciliation_required = true')
    expect(edge).toContain("'mark_notification_delivery_reconciliation'")
  })
})

describe('bounded retry behavior', () => {
  it('retries explicit provider rejections with bounded backoff', () => {
    expect(migration).toContain('create or replace function public.fail_notification_delivery')
    expect(migration).toContain('email_next_attempt_at = now() + make_interval')
    expect(migration).toContain('sms_next_attempt_at = now() + make_interval')
    expect(edge).toContain('retrySeconds(notification.attempt_count)')
    expect(edge).toContain('error instanceof ProviderRejectedError')
  })

  it('moves repeated explicit failures to operator reconciliation', () => {
    expect(migration).toContain('v_max_attempts integer := 8')
    expect(migration).toContain(
      'email_reconciliation_required = email_attempts >= v_max_attempts',
    )
    expect(migration).toContain(
      'sms_reconciliation_required = sms_attempts >= v_max_attempts',
    )
    expect(migration).toContain('Maximum email delivery attempts reached')
    expect(migration).toContain('Maximum SMS delivery attempts reached')
    expect(edge).toContain('const MAX_DELIVERY_ATTEMPTS = 8')
  })

  it('leaves queued rows untouched while a delivery provider is unconfigured', () => {
    expect(edge).toContain('if (emailReady) {')
    expect(edge).toContain('if (smsReady) {')
    expect(edge).not.toContain("update({ email_pending: false })")
    expect(edge).not.toContain("update({ sms_pending: false })")
  })

  it('uses documented Resend idempotency and records both provider message ids', () => {
    expect(migration).toContain("'wurx-email-' || c.id::text")
    expect(
      edge.match(/'Idempotency-Key': notification\.delivery_key/g) ?? [],
    ).toHaveLength(1)
    expect(migration).toContain('email_provider_message_id')
    expect(migration).toContain('sms_provider_message_id')
  })

  it('exposes queue mutation and recovery RPCs only to the service role', () => {
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration).toContain(
      'grant execute on function public.recover_stale_notification_deliveries(integer) to service_role',
    )
    expect(migration).toContain(
      'grant execute on function public.claim_notification_deliveries(text, integer, uuid) to service_role',
    )
    expect(migration).toContain(
      'grant execute on function public.requeue_notification_delivery(text, uuid) to service_role',
    )
  })
})
