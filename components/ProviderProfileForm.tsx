'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Service = { slug: string; name: string }
type Provider = {
  id: string
  business_name: string
  bio: string | null
  service_slugs: string[]
  service_areas: string[]
  base_postal_code: string | null
  travel_radius_km: number
}

export function ProviderProfileForm({
  provider,
  services,
}: {
  provider: Provider
  services: Service[]
}) {
  const router = useRouter()
  const [businessName, setBusinessName] = useState(provider.business_name)
  const [bio, setBio] = useState(provider.bio ?? '')
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(provider.service_slugs)
  const [basePostalCode, setBasePostalCode] = useState(provider.base_postal_code ?? '')
  const [serviceAreas, setServiceAreas] = useState(
    provider.service_areas
      .filter((a) => a !== (provider.base_postal_code ?? '').toUpperCase().replace(/\s/g, '').slice(0, 3))
      .join(', '),
  )
  const [travelRadiusKm, setTravelRadiusKm] = useState(provider.travel_radius_km)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  function toggleService(slug: string) {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!businessName.trim() || selectedSlugs.length === 0 || !basePostalCode.trim()) {
      setError('Business name, at least one service, and a base postal code are required.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const normalizedBase = basePostalCode.trim().toUpperCase().replace(/\s/g, '')
    const baseFsa = normalizedBase.slice(0, 3)
    const areaList = serviceAreas
      .split(',')
      .map((s) => s.trim().toUpperCase().replace(/\s/g, '').slice(0, 3))
      .filter(Boolean)
    const uniqueAreas = Array.from(new Set([baseFsa, ...areaList]))

    const { error: updateError } = await supabase
      .from('providers')
      .update({
        business_name: businessName.trim(),
        bio: bio.trim() || null,
        service_slugs: selectedSlugs,
        service_areas: uniqueAreas,
        base_postal_code: basePostalCode.trim().toUpperCase(),
        travel_radius_km: travelRadiusKm,
      })
      .eq('id', provider.id)

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
      {saved && <p className="form-note" style={{ color: 'var(--brand)' }}>Saved.</p>}

      <label htmlFor="businessName">Business or your name</label>
      <input
        id="businessName"
        type="text"
        required
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
      />

      <label htmlFor="bio">About you</label>
      <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

      <label>Services you offer</label>
      <div className="service-check-grid">
        {services.map((s) => {
          const on = selectedSlugs.includes(s.slug)
          return (
            <label key={s.slug} className={`service-check${on ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleService(s.slug)}
              />
              <span>{s.name}</span>
            </label>
          )
        })}
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

      <label htmlFor="serviceAreas">Other areas you serve</label>
      <input
        id="serviceAreas"
        type="text"
        value={serviceAreas}
        onChange={(e) => setServiceAreas(e.target.value)}
        placeholder="K2P, K1S, K1N"
      />

      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading}
        style={{ width: '100%', marginTop: 16 }}
      >
        {loading ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}
