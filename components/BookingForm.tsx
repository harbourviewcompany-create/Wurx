'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatMinutes } from '@/lib/format'

type Service = {
  id: string
  slug: string
  name: string
  icon: string | null
  default_duration_minutes: number
  credit_multiplier: number
}

export function BookingForm({
  services,
  availableMinutes,
  defaults,
}: {
  services: Service[]
  availableMinutes: number
  defaults: { address_line1: string; city: string; postal_code: string }
}) {
  const router = useRouter()
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const selected = services.find((s) => s.id === serviceId) ?? services[0]

  const [duration, setDuration] = useState(
    selected?.default_duration_minutes ?? 120,
  )
  const [start, setStart] = useState('')
  const [address, setAddress] = useState(defaults.address_line1)
  const [city, setCity] = useState(defaults.city)
  const [postal, setPostal] = useState(defaults.postal_code)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const cost = useMemo(
    () => (selected ? Math.ceil(duration * selected.credit_multiplier) : 0),
    [selected, duration],
  )
  const affordable = cost <= availableMinutes

  function onServiceChange(id: string) {
    setServiceId(id)
    const svc = services.find((s) => s.id === id)
    if (svc) setDuration(svc.default_duration_minutes)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!start) {
      setError('Please choose a date and time.')
      return
    }
    if (new Date(start).getTime() < Date.now()) {
      setError('Please choose a time in the future.')
      return
    }
    if (!affordable) {
      setError('That booking costs more minutes than you have available.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('request_booking', {
      p_service_id: serviceId,
      p_scheduled_start: new Date(start).toISOString(),
      p_duration_minutes: duration,
      p_address_line1: address,
      p_city: city,
      p_postal_code: postal,
      p_notes: notes,
    })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (services.length === 0) {
    return <p className="muted">No services are available to book right now.</p>
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginTop: 18 }}>
      {error && <div className="form-error">{error}</div>}

      <label htmlFor="service">Service</label>
      <select
        id="service"
        value={serviceId}
        onChange={(e) => onServiceChange(e.target.value)}
      >
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon ? `${s.icon} ` : ''}
            {s.name}
          </option>
        ))}
      </select>

      <label htmlFor="start">Date &amp; time</label>
      <input
        id="start"
        type="datetime-local"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        required
      />

      <label htmlFor="duration">Duration (minutes)</label>
      <input
        id="duration"
        type="number"
        min={30}
        step={15}
        value={duration}
        onChange={(e) => setDuration(Math.max(30, Number(e.target.value)))}
        required
      />

      <label htmlFor="address">Address</label>
      <input
        id="address"
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Street address"
      />

      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="postal">Postal code</label>
          <input
            id="postal"
            type="text"
            value={postal}
            onChange={(e) => setPostal(e.target.value)}
          />
        </div>
      </div>

      <label htmlFor="notes">Notes for the pro (optional)</label>
      <textarea
        id="notes"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="list-row" style={{ marginTop: 16 }}>
        <span className="muted">This booking costs</span>
        <strong className={affordable ? '' : 'tag bad'}>
          {formatMinutes(cost)}
        </strong>
      </div>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading || !affordable}
        style={{ width: '100%', marginTop: 16 }}
      >
        {loading ? 'Booking…' : 'Confirm booking'}
      </button>
      {!affordable && (
        <p className="form-note">
          You need {formatMinutes(cost - availableMinutes)} more. Minutes refresh
          each billing period.
        </p>
      )}
    </form>
  )
}
