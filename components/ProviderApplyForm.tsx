'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Service = { slug: string; name: string }

export function ProviderApplyForm({ services }: { services: Service[] }) {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [bio, setBio] = useState('')
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [basePostalCode, setBasePostalCode] = useState('')
  const [travelRadiusKm, setTravelRadiusKm] = useState(15)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleService(slug: string) {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!businessName.trim()) {
      setError('Business or your name is required.')
      return
    }
    if (selectedSlugs.length === 0) {
      setError('Pick at least one service you offer.')
      return
    }
    if (!basePostalCode.trim()) {
      setError('Your base postal code is required so we can match you to nearby jobs.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be signed in.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('providers').insert({
      user_id: user.id,
      business_name: businessName.trim(),
      bio: bio.trim() || null,
      service_slugs: selectedSlugs,
      service_areas: [basePostalCode.trim().toUpperCase()],
      base_postal_code: basePostalCode.trim().toUpperCase(),
      travel_radius_km: travelRadiusKm,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Best-effort: mark the profile as a provider for nav/routing. Not fatal
    // if it fails — the providers row is the source of truth.
    await supabase.from('profiles').update({ role: 'provider' }).eq('id', user.id)

    router.push('/provider/dashboard')
    router.refresh()
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginTop: 18 }}>
      {error && <div className="form-error">{error}</div>}

      <label htmlFor="businessName">Business or your name</label>
      <input
        id="businessName"
        type="text"
        required
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        placeholder="e.g. Campbell Home Services"
      />

      <label htmlFor="bio">About you (optional)</label>
      <textarea
        id="bio"
        rows={3}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Experience, specialties, anything customers should know."
      />

      <label>Services you offer</label>
      <div className="grid grid-2" style={{ gap: 8, marginBottom: 4 }}>
        {services.map((s) => (
          <label
            key={s.slug}
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              margin: 0,
              cursor: 'pointer',
              borderColor: selectedSlugs.includes(s.slug) ? 'var(--brand)' : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={selectedSlugs.includes(s.slug)}
              onChange={() => toggleService(s.slug)}
            />
            {s.name}
          </label>
        ))}
      </div>

      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <label htmlFor="basePostalCode">Base postal code</label>
          <input
            id="basePostalCode"
            type="text"
            required
            value={basePostalCode}
            onChange={(e) => setBasePostalCode(e.target.value)}
            placeholder="K1P 1J1"
          />
        </div>
        <div>
          <label htmlFor="travelRadius">Travel radius (km)</label>
          <input
            id="travelRadius"
            type="number"
            min={1}
            max={100}
            value={travelRadiusKm}
            onChange={(e) => setTravelRadiusKm(Math.max(1, Number(e.target.value)))}
          />
        </div>
      </div>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading}
        style={{ width: '100%', marginTop: 16 }}
      >
        {loading ? 'Submitting…' : 'Submit application'}
      </button>
    </form>
  )
}
