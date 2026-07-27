'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { startCheckoutSession } from '@/lib/checkout'

/**
 * When a user lands on /pricing?priceId=… already signed in (e.g. after email
 * confirmation), start Stripe Checkout once without requiring another click.
 */
export function AutoStartCheckout({
  priceId,
  isAuthed,
}: {
  priceId: string | null
  isAuthed: boolean
}) {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!priceId || !isAuthed || started.current) return
    started.current = true

    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const url = await startCheckoutSession(supabase, user.id, priceId)
        if (!cancelled) window.location.href = url
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not open checkout. Choose a plan below.',
          )
          // Drop priceId from the URL so refresh does not loop.
          router.replace('/pricing')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [priceId, isAuthed, router])

  if (!priceId || !isAuthed) return null

  return (
    <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
      {error ? (
        <p className="form-error" style={{ margin: 0 }}>
          {error}
        </p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Opening secure checkout for your plan…
        </p>
      )}
    </div>
  )
}
