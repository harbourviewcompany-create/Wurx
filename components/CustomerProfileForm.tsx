'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  full_name: string
  phone: string
  address_line1: string
  city: string
  province: string
  postal_code: string
}

export function CustomerProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone)
  const [addressLine1, setAddressLine1] = useState(profile.address_line1)
  const [city, setCity] = useState(profile.city)
  const [province, setProvince] = useState(profile.province)
  const [postalCode, setPostalCode] = useState(profile.postal_code)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      setError('Your session expired — log in again.')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName || null,
        phone: phone || null,
        address_line1: addressLine1 || null,
        city: city || null,
        province: province || null,
        postal_code: postalCode || null,
      })
      .eq('id', user.id)

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card">
      {error && <div className="form-error">{error}</div>}
      {saved && (
        <p className="muted" style={{ marginTop: 0 }}>
          Saved.
        </p>
      )}

      <label htmlFor="full_name">Full name</label>
      <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />

      <label htmlFor="phone">Phone</label>
      <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <label htmlFor="address_line1">Address</label>
      <input
        id="address_line1"
        value={addressLine1}
        onChange={(e) => setAddressLine1(e.target.value)}
        placeholder="Street address"
      />

      <div className="grid grid-3">
        <div>
          <label htmlFor="city">City</label>
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label htmlFor="province">Province</label>
          <input id="province" value={province} onChange={(e) => setProvince(e.target.value)} />
        </div>
        <div>
          <label htmlFor="postal_code">Postal code</label>
          <input id="postal_code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 14 }}>
        This address is used to pre-fill new bookings — you can still change it per booking.
      </p>

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
