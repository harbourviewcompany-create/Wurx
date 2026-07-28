'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Post-checkout lag UI (F3). Stripe success lands on /dashboard?success=true
 * before invoice.paid may have granted minutes. Poll refresh until balance
 * appears or the user navigates away.
 */
export function MinutesArriving({
  active,
  intervalMs = 3500,
  maxAttempts = 24,
}: {
  active: boolean
  intervalMs?: number
  maxAttempts?: number
}) {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (!active) return

    const id = window.setInterval(() => {
      setAttempts((n) => {
        const next = n + 1
        if (next >= maxAttempts) {
          window.clearInterval(id)
          return next
        }
        router.refresh()
        return next
      })
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [active, intervalMs, maxAttempts, router])

  if (!active) return null

  const timedOut = attempts >= maxAttempts

  return (
    <div
      className="card rise"
      role="status"
      aria-live="polite"
      style={{
        marginBottom: 18,
        borderColor: 'var(--brand)',
        background: 'color-mix(in srgb, var(--brand) 6%, transparent)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        {timedOut ? 'Still setting up your minutes' : 'Your minutes are on the way…'}
      </p>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {timedOut
          ? 'Payment succeeded. Refresh this page in a moment, or open Book a service — your balance should appear shortly.'
          : 'Payment succeeded. We’re confirming your plan and adding service time to your balance.'}
      </p>
    </div>
  )
}
