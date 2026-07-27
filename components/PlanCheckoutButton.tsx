'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  loginUrlForPlan,
  signupUrlForPlan,
  startCheckoutSession,
} from '@/lib/checkout'

/**
 * Starts a Stripe Checkout session for a subscription plan by invoking the
 * `create-checkout` Supabase Edge Function. The function looks the plan up
 * server-side by its Stripe price id, so we never trust a client-supplied
 * amount here — we only pass the price id.
 *
 * Unauthenticated users are sent to signup (preferred) with priceId preserved
 * so they land on Stripe after creating an account without re-picking a plan.
 */
export function PlanCheckoutButton({
  priceId,
  planName,
  planSlug,
  isAuthed,
  variant = 'default',
}: {
  priceId: string | null
  planName: string
  planSlug?: string
  isAuthed: boolean
  variant?: 'default' | 'primary'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const btnClass =
    variant === 'primary' ? 'btn btn-primary btn-lg' : 'btn btn-lg'

  if (!priceId) {
    return (
      <button
        className="btn btn-lg"
        disabled
        title="This plan is not purchasable yet"
        style={{ width: '100%' }}
      >
        Coming soon
      </button>
    )
  }

  // Capture after null guard so nested closures see `string`, not `string | null`.
  const resolvedPriceId: string = priceId

  async function subscribe() {
    setError(null)

    if (!isAuthed) {
      router.push(signupUrlForPlan(resolvedPriceId, planSlug))
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(loginUrlForPlan(resolvedPriceId, planSlug))
        return
      }

      const url = await startCheckoutSession(supabase, user.id, resolvedPriceId)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="form-error" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}
      <button
        className={btnClass}
        onClick={subscribe}
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Redirecting…' : `Choose ${planName}`}
      </button>
      {!isAuthed && (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13, textAlign: 'center' }}>
          Creates your account, then secure checkout — cancel anytime.
        </p>
      )}
    </>
  )
}
