'use client'

import { useState } from 'react'
import { Banknote, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/format'

/**
 * Stripe Connect onboarding + earnings summary for a provider. Until this
 * existed, provider_earnings accrued with no way for a pro to ever be paid.
 */
export function PayoutsCard({
  payoutsEnabled,
  hasAccount,
  pendingCents,
  paidCents,
}: {
  payoutsEnabled: boolean
  hasAccount: boolean
  pendingCents: number
  paidCents: number
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onboard() {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: fnError } = await supabase.functions.invoke<{
        url?: string
        error?: string
      }>('provider-payouts', { body: { action: 'onboard' } })

      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('Could not start payout setup.')

      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
        <h3 className="card-heading" style={{ margin: 0 }}>
          <Banknote size={18} /> Earnings
        </h3>
        <span className={payoutsEnabled ? 'tag good' : 'tag warn'}>
          {payoutsEnabled ? 'Payouts on' : 'Setup needed'}
        </span>
      </div>

      <div className="grid grid-2" style={{ gap: 12, marginTop: 12 }}>
        <div>
          <p className="tile-label">Awaiting payout</p>
          <div className="stat" style={{ fontSize: 28 }}>
            {formatPrice(pendingCents)}
          </div>
        </div>
        <div>
          <p className="tile-label">Paid out</p>
          <div className="stat" style={{ fontSize: 28 }}>
            {formatPrice(paidCents)}
          </div>
        </div>
      </div>

      {!payoutsEnabled && (
        <>
          <p className="muted" style={{ marginTop: 14 }}>
            {hasAccount
              ? 'Your payout setup is incomplete — finish it to get paid for completed jobs.'
              : 'Set up payouts to receive money for the jobs you complete. Takes about two minutes.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={onboard}
            disabled={loading}
            style={{ marginTop: 10 }}
          >
            {loading ? 'Opening…' : hasAccount ? 'Finish payout setup' : 'Set up payouts'}
            <ExternalLink size={15} />
          </button>
        </>
      )}

      {error && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  )
}
