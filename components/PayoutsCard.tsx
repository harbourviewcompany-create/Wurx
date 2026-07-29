'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { EmbeddedPayoutOnboarding } from '@/components/EmbeddedPayoutOnboarding'

/**
 * Stripe Connect onboarding + earnings summary for a provider.
 * Onboarding is embedded in Wurx (no redirect to Stripe's site).
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
  const router = useRouter()
  const [showOnboarding, setShowOnboarding] = useState(false)

  function handleComplete() {
    setShowOnboarding(false)
    router.refresh()
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

      {!payoutsEnabled && !showOnboarding && (
        <>
          <p className="muted" style={{ marginTop: 14 }}>
            {hasAccount
              ? 'Your payout setup is incomplete — finish it here to get paid for completed jobs.'
              : 'Set up payouts to receive money for the jobs you complete. Takes about two minutes, right here on Wurx.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowOnboarding(true)}
            style={{ marginTop: 10 }}
          >
            {hasAccount ? 'Finish payout setup' : 'Set up payouts'}
          </button>
        </>
      )}

      {showOnboarding && (
        <EmbeddedPayoutOnboarding
          onComplete={handleComplete}
          onCancel={() => setShowOnboarding(false)}
        />
      )}
    </div>
  )
}
