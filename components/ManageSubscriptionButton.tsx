'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Opens the Stripe-hosted Billing Portal via the create-billing-portal-session
 * Edge Function, so customers can cancel, change plan, or update their payment
 * method without any custom proration/cancellation logic on our side. The
 * existing stripe-webhook already handles customer.subscription.updated and
 * .deleted, so whatever the customer does in the portal syncs back correctly.
 */
export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openPortal() {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: fnError } = await supabase.functions.invoke<{
        url?: string
        error?: string
      }>('create-billing-portal-session')

      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('No billing portal URL returned.')

      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="form-error" style={{ marginTop: 6, marginBottom: 0 }}>
          {error}
        </div>
      )}
      <button className="btn btn-ghost" onClick={openPortal} disabled={loading} style={{ marginTop: 8 }}>
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
    </>
  )
}
