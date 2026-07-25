'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CompleteBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function complete() {
    if (!confirm('Mark this job as completed? This settles the customer\u2019s held minutes.')) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('complete_booking', {
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
    <button className="btn btn-ghost" onClick={complete} disabled={loading}>
      {loading ? '…' : 'Mark complete'}
    </button>
  )
}
