'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Starts a Stripe Checkout session for a subscription plan by invoking the
 * `create-checkout` Supabase Edge Function. The function looks the plan up
 * server-side by its Stripe price id, so we never trust a client-supplied
 * amount here — we only pass the price id.
 */
export function PlanCheckoutButton({
  priceId,
  planName,
  isAuthed,
}: {
  priceId: string | null
  planName: string
  isAuthed: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!priceId) {
    return (
      <button className="btn" disabled title="This plan is not purchasable yet">
        Coming soon
      </button>
    )
  }

  async function subscribe() {
    setError(null)

    if (!isAuthed) {
      router.push(`/login?redirect=/pricing`)
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/login?redirect=/pricing`)
        return
      }

      const { data, error: fnError } = await supabase.functions.invoke<{
        url?: string
        error?: string
      }>('create-checkout', {
        body: { userId: user.id, priceId },
      })

      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('No checkout URL returned.')

      window.location.href = data.url
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
        className="btn btn-primary"
        onClick={subscribe}
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Redirecting…' : `Subscribe to ${planName}`}
      </button>
    </>
  )
}
