import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260731140000_wurx_notification_delivery_queue.sql',
    import.meta.url,
  ),
  'utf8',
)

type DeliveryState = {
  pending: boolean
  attempts: number
  claimedAt: number | null
  deliveryStartedAt: number | null
  reconciliationRequired: boolean
  providerMessageId: string | null
}

const CLAIM_TIMEOUT_SECONDS = 15 * 60
const MAX_ATTEMPTS = 8

function initial(): DeliveryState {
  return {
    pending: true,
    attempts: 0,
    claimedAt: null,
    deliveryStartedAt: null,
    reconciliationRequired: false,
    providerMessageId: null,
  }
}

function claim(state: DeliveryState, now: number): DeliveryState {
  if (!state.pending || state.reconciliationRequired || state.deliveryStartedAt !== null) {
    return state
  }
  if (
    state.claimedAt !== null &&
    now - state.claimedAt < CLAIM_TIMEOUT_SECONDS
  ) {
    return state
  }
  return { ...state, attempts: state.attempts + 1, claimedAt: now }
}

function start(state: DeliveryState, now: number): DeliveryState {
  if (!state.pending || state.reconciliationRequired || state.claimedAt === null) {
    return state
  }
  return { ...state, deliveryStartedAt: now }
}

function recoverStale(state: DeliveryState, now: number): DeliveryState {
  if (
    state.pending &&
    !state.reconciliationRequired &&
    state.deliveryStartedAt !== null &&
    now - state.deliveryStartedAt >= CLAIM_TIMEOUT_SECONDS
  ) {
    return {
      ...state,
      claimedAt: null,
      reconciliationRequired: true,
    }
  }
  return state
}

function explicitReject(state: DeliveryState): DeliveryState {
  if (!state.pending) return state
  return {
    ...state,
    claimedAt: null,
    deliveryStartedAt: null,
    reconciliationRequired: state.attempts >= MAX_ATTEMPTS,
  }
}

function ambiguousOutcome(
  state: DeliveryState,
  providerMessageId: string | null = null,
): DeliveryState {
  return {
    ...state,
    claimedAt: null,
    reconciliationRequired: true,
    providerMessageId: providerMessageId ?? state.providerMessageId,
  }
}

describe('notification delivery crash fault injection', () => {
  it('recovers a crash before provider submission through the stale claim path', () => {
    const claimed = claim(initial(), 0)
    const beforeTimeout = claim(claimed, CLAIM_TIMEOUT_SECONDS - 1)
    const recovered = claim(claimed, CLAIM_TIMEOUT_SECONDS)

    expect(beforeTimeout.attempts).toBe(1)
    expect(recovered.attempts).toBe(2)
    expect(recovered.reconciliationRequired).toBe(false)
    expect(migration).toContain("claimed_at < now() - interval '15 minutes'")
  })

  it('quarantines a crash after provider submission instead of resending', () => {
    const started = start(claim(initial(), 0), 1)
    const recovered = recoverStale(started, 1 + CLAIM_TIMEOUT_SECONDS)
    const attemptedReclaim = claim(recovered, 1 + CLAIM_TIMEOUT_SECONDS * 2)

    expect(recovered.reconciliationRequired).toBe(true)
    expect(recovered.deliveryStartedAt).toBe(1)
    expect(attemptedReclaim).toEqual(recovered)
    expect(migration).toContain('recover_stale_notification_deliveries')
  })

  it('moves the eighth explicit provider rejection to reconciliation', () => {
    let state = initial()
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      state = claim(state, attempt * CLAIM_TIMEOUT_SECONDS)
      state = start(state, attempt * CLAIM_TIMEOUT_SECONDS + 1)
      state = explicitReject(state)
    }

    expect(state.attempts).toBe(MAX_ATTEMPTS)
    expect(state.pending).toBe(true)
    expect(state.reconciliationRequired).toBe(true)
    expect(claim(state, 99 * CLAIM_TIMEOUT_SECONDS)).toEqual(state)
    expect(migration).toContain('v_max_attempts integer := 8')
  })

  it('quarantines an ambiguous accepted response and preserves provider evidence', () => {
    const started = start(claim(initial(), 0), 1)
    const ambiguous = ambiguousOutcome(started, 'provider-message-123')

    expect(ambiguous.reconciliationRequired).toBe(true)
    expect(ambiguous.providerMessageId).toBe('provider-message-123')
    expect(claim(ambiguous, CLAIM_TIMEOUT_SECONDS * 2)).toEqual(ambiguous)
    expect(migration).toContain('provider_message_id')
  })
})
