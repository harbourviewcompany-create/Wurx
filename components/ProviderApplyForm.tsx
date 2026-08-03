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
  const [serviceAreas, setServiceAreas] = useState('')
  const [travelRadiusKm, setTravelRadiusKm] = useState(15)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleService(slug: string) {
    setSelectedSlugs((previous) =>
      previous.includes(slug)
        ? previous.filter((selectedSlug) => selectedSlug !== slug)
        : [...previous, slug],
    )
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
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

    const normalizedBase = basePostalCode.trim().toUpperCase().replace(/\s/g, '')
    const baseFsa = normalizedBase.slice(0, 3)
    const areaList = serviceAreas
      .split(',')
      .map((area) => area.trim().toUpperCase().replace(/\s/g, '').slice(0, 3))
      .filter(Boolean)
    const uniqueAreas = Array.from(new Set([baseFsa, ...areaList]))

    const { error: insertError } = await supabase.from('providers').insert({
      user_id: user.id,
      business_name: businessName.trim(),
      bio: bio.trim() || null,
      service_slugs: selectedSlugs,
      service_areas: uniqueAreas,
      base_postal_code: basePostalCode.trim().toUpperCase(),
      travel_radius_km: travelRadiusKm,
      verification: 'pending',
      is_active: false,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

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
        onChange={(event) => setBusinessName(event.target.value)}
        placeholder="e.g. Campbell Home Services"
      />

      <label htmlFor="bio">About you (optional)</label>
      <textarea
        id="bio"
        rows={3}
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        placeholder="Experience, specialties, anything customers should know."
      />

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Services you offer</legend>
        <div className="service-check-grid">
          {services.map((service) => {
            const selected = selectedSlugs.includes(service.slug)
            return (
              <label
                key={service.slug}
                className={`service-check${selected ? ' is-on' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleService(service.slug)}
                />
                <span>{service.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <label htmlFor="basePostalCode">Base postal code</label>
          <input
            id="basePostalCode"
            type="text"
            required
            value={basePostalCode}
            onChange={(event) => setBasePostalCode(event.target.value)}
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
            onChange={(event) => setTravelRadiusKm(Math.max(1, Number(event.target.value)))}
          />
        </div>
      </div>

      <label htmlFor="serviceAreas">Other areas you serve (optional)</label>
      <input
        id="serviceAreas"
        type="text"
        value={serviceAreas}
        onChange={(event) => setServiceAreas(event.target.value)}
        placeholder="K2P, K1S, K1N"
      />
      <p className="form-note" style={{ marginTop: -4 }}>
        Comma-separated postal FSAs (the first 3 characters, e.g. K1P). Jobs
        are matched to your base code plus anything listed here.
      </p>

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
