'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ReleaseBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function release() {
    if (
      !confirm(
        "Can't make this job? This hands it back so another provider can take it. The customer keeps their booking.",
      )
    )
      return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('release_booking', {
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
    <button type="button" className="btn btn-ghost" onClick={release} disabled={loading}>
      {loading ? '…' : "Can't make it"}
    </button>
  )
}
