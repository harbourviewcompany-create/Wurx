'use client'

import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Opens the Stripe Billing Portal so a customer can change plan, update their
 * card, or cancel — previously there was no in-app path to any of that.
 */
export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: fnError } = await supabase.functions.invoke<{
        url?: string
        error?: string
      }>('billing-portal', { body: {} })

      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('Could not open the billing portal.')

      window.location.href = data.url
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={open} disabled={loading}>
        <CreditCard size={16} />
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
      {error && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </>
  )
}
