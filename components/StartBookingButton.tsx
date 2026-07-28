'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function StartBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function start() {
    if (!confirm('Mark this job as started? The customer will see “In progress”.')) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('start_booking', {
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
    <button className="btn btn-primary" onClick={start} disabled={loading}>
      {loading ? '…' : 'Start job'}
    </button>
  )
}
