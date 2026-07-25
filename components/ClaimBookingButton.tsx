'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ClaimBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function claim() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('claim_booking', {
      p_booking_id: bookingId,
    })
    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <button className="btn btn-primary" onClick={claim} disabled={loading}>
      {loading ? '…' : 'Claim job'}
    </button>
  )
}
