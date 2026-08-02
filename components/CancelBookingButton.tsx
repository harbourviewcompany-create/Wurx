'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function cancel() {
    if (!confirm('Cancel this booking and release the held minutes?')) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('cancel_booking', {
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
    <button type="button" className="btn btn-ghost" onClick={cancel} disabled={loading}>
      {loading ? '…' : 'Cancel'}
    </button>
  )
}
