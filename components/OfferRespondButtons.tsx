'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function OfferRespondButtons({
  offerId,
  fullWidth = false,
}: {
  offerId: string
  fullWidth?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)

  async function respond(accept: boolean) {
    setLoading(accept ? 'accept' : 'decline')
    const supabase = createClient()
    const { error } = await supabase.rpc('respond_to_offer', {
      p_offer_id: offerId,
      p_accept: accept,
    })
    if (error) {
      alert(error.message)
      setLoading(null)
      return
    }
    router.refresh()
  }

  return (
    <div
      className={fullWidth ? 'offer-actions' : undefined}
      style={fullWidth ? undefined : { display: 'flex', gap: 8 }}
    >
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => respond(true)}
        disabled={loading !== null}
        style={fullWidth ? { flex: 1 } : undefined}
      >
        {loading === 'accept' ? '…' : 'Accept job'}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => respond(false)}
        disabled={loading !== null}
        style={fullWidth ? { flex: 1 } : undefined}
      >
        {loading === 'decline' ? '…' : 'Decline'}
      </button>
    </div>
  )
}
