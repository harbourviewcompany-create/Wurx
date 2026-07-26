'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  formatPhone,
  isValidPostalCode,
  normalizePhone,
  normalizePostalCode,
} from '@/lib/profile'

export type AccountProfile = {
  id: string
  full_name: string | null
  phone: string | null
  address_line1: string | null
  city: string | null
  province: string | null
  postal_code: string | null
}

/**
 * Editing the customer's own profile. These fields pre-fill every booking, so
 * getting them right once means the booking form is a two-tap flow afterwards.
 * RLS scopes the write to the caller's own row, and a database trigger blocks
 * any attempt to change `role` from here.
 */
export function AccountForm({ profile, email }: { profile: AccountProfile; email: string }) {
  const router = useRouter()

  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [phone, setPhone] = useState(formatPhone(profile.phone))
  const [address, setAddress] = useState(profile.address_line1 ?? '')
  const [city, setCity] = useState(profile.city ?? 'Ottawa')
  const [province, setProvince] = useState(profile.province ?? 'ON')
  const [postal, setPostal] = useState(profile.postal_code ?? '')

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!fullName.trim()) return setError('Please enter your name.')
    if (postal.trim() && !isValidPostalCode(postal)) {
      return setError('That postal code doesn’t look right — try “K1A 0B1”.')
    }
    if (phone.trim() && !normalizePhone(phone)) {
      return setError('That phone number is too short to reach you on.')
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: normalizePhone(phone) || null,
        address_line1: address.trim() || null,
        city: city.trim() || null,
        province: province.trim().toUpperCase() || null,
        postal_code: postal.trim() ? normalizePostalCode(postal) : null,
      })
      .eq('id', profile.id)

    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      {error && <div className="form-error">{error}</div>}
      {saved && (
        <p className="form-note" style={{ color: 'var(--brand)', display: 'flex', gap: 6 }}>
          <Check size={16} /> Saved.
        </p>
      )}

      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} disabled readOnly />
      <p className="form-note" style={{ marginTop: 6 }}>
        Your email is your login. Contact us to change it.
      </p>

      <label htmlFor="fullName" style={{ marginTop: 18, display: 'block' }}>
        Full name
      </label>
      <input
        id="fullName"
        type="text"
        autoComplete="name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />

      <label htmlFor="phone">Phone</label>
      <input
        id="phone"
        type="tel"
        autoComplete="tel"
        placeholder="(613) 555-0142"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <p className="form-note" style={{ marginTop: 6 }}>
        Your pro uses this to text you when they&apos;re on the way.
      </p>

      <p className="tile-label" style={{ marginTop: 22 }}>
        Default service address
      </p>
      <input
        type="text"
        autoComplete="address-line1"
        placeholder="Street address"
        aria-label="Street address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <div className="grid grid-3" style={{ gap: 12, marginTop: 10 }}>
        <input
          type="text"
          autoComplete="address-level2"
          placeholder="City"
          aria-label="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <input
          type="text"
          autoComplete="address-level1"
          placeholder="Province"
          aria-label="Province"
          maxLength={2}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        />
        <input
          type="text"
          autoComplete="postal-code"
          placeholder="K1A 0B1"
          aria-label="Postal code"
          value={postal}
          onChange={(e) => setPostal(e.target.value)}
          onBlur={() => setPostal((p) => (p.trim() ? normalizePostalCode(p) : p))}
        />
      </div>

      <button
        className="btn btn-primary btn-lg"
        type="submit"
        disabled={loading}
        style={{ width: '100%', marginTop: 20 }}
      >
        {loading ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
