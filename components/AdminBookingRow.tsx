'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type MatchingProvider = { id: string; business_name: string }

export function AdminBookingRow({
  bookingId,
  label,
  status,
  matchingProviders,
}: {
  bookingId: string
  label: string
  status: string
  matchingProviders: MatchingProvider[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(matchingProviders[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  async function assign() {
    if (!selected) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_assign_booking', {
      p_booking_id: bookingId,
      p_provider_id: selected,
    })
    setLoading(false)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
  }

  async function cancel() {
    if (!confirm('Cancel this booking?')) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: bookingId })
    setLoading(false)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <div>
        {label}
        <div className="muted" style={{ fontSize: 14 }}>{status}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {status === 'requested' && (
          <>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {matchingProviders.length === 0 && <option value="">No matching providers</option>}
              {matchingProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.business_name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={loading || !selected} onClick={assign}>
              Assign
            </button>
          </>
        )}
        <button className="btn btn-ghost" disabled={loading} onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
