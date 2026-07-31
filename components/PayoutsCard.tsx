'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { EmbeddedPayoutOnboarding } from '@/components/EmbeddedPayoutOnboarding'

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
    <section id="earnings" className="card earnings-card" aria-labelledby="earnings-heading">
      <div className="activity-head">
        <h2 id="earnings-heading" className="card-heading" style={{ margin: 0, fontSize: 23 }}>
          <Banknote size={20} aria-hidden="true" /> Earnings
        </h2>
        <span className={payoutsEnabled ? 'tag good' : 'tag warn'}>
          {payoutsEnabled ? 'Payouts ready' : 'Setup required'}
        </span>
      </div>

      <div className="grid grid-2" style={{ gap: 16, marginTop: 18 }}>
        <div>
          <p className="tile-label">Awaiting payout</p>
          <div className="stat" style={{ fontSize: 34 }}>
            {formatPrice(pendingCents)}
          </div>
        </div>
        <div>
          <p className="tile-label">Paid out</p>
          <div className="stat" style={{ fontSize: 34 }}>
            {formatPrice(paidCents)}
          </div>
        </div>
      </div>

      {!payoutsEnabled && !showOnboarding && (
        <>
          <p className="muted" style={{ margin: '16px 0 0' }}>
            {hasAccount
              ? 'Finish the remaining payout steps before completed-job earnings can be deposited.'
              : 'Add your identity, bank, and payout information securely inside Wurx. Setup usually takes a few minutes.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowOnboarding(true)}
            style={{ marginTop: 12 }}
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
    </section>
  )
}
