'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function OfferRespondButtons({ offerId }: { offerId: string }) {
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
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="btn btn-primary"
        onClick={() => respond(true)}
        disabled={loading !== null}
      >
        {loading === 'accept' ? '…' : 'Accept'}
      </button>
      <button
        className="btn btn-ghost"
        onClick={() => respond(false)}
        disabled={loading !== null}
      >
        {loading === 'decline' ? '…' : 'Decline'}
      </button>
    </div>
  )
}
