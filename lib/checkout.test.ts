import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { startCheckoutSession } from './checkout'

describe('startCheckoutSession', () => {
  it('sends only the selected Stripe price and never a client-controlled user id', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { url: 'https://checkout.stripe.test/session' },
      error: null,
    })
    const supabase = { functions: { invoke } } as unknown as SupabaseClient

    await expect(startCheckoutSession(supabase, 'price_test_123')).resolves.toBe(
      'https://checkout.stripe.test/session',
    )

    expect(invoke).toHaveBeenCalledWith('create-checkout', {
      body: { priceId: 'price_test_123' },
    })
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('userId')
  })

  it('surfaces function errors', async () => {
    const supabase = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not authenticated' },
        }),
      },
    } as unknown as SupabaseClient

    await expect(startCheckoutSession(supabase, 'price_test_123')).rejects.toThrow(
      'Not authenticated',
    )
  })
})

describe('create-checkout security contract', () => {
  const source = readFileSync(
    new URL('../supabase/functions/create-checkout/index.ts', import.meta.url),
    'utf8',
  )

  it('derives the caller from a verified JWT', () => {
    expect(source).toContain('supabase.auth.getUser(token)')
    expect(source).not.toContain('const { userId, priceId } = await req.json()')
  })

  it('blocks duplicate active subscriptions and uses Stripe idempotency', () => {
    expect(source).toContain('ACTIVE_SUBSCRIPTION_STATUSES')
    expect(source).toContain('existingSubscription')
    expect(source).toContain('{ idempotencyKey }')
  })
})
