'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMinutes, formatPostalCode, postalFsa } from '@/lib/format'
import { affordability, serviceCostMinutes } from '@/lib/booking'
import { ServiceIcon } from '@/components/ServiceIcon'

export type BrowsableService = {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  default_duration_minutes: number
  credit_multiplier: number
  requires_licensed_provider: boolean
}

type Filter = 'all' | 'quick' | 'licensed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'quick', label: 'Under 1 hour' },
  { key: 'licensed', label: 'Licensed pro' },
]

/** Rank services for the current season so the first screen feels smart. */
function seasonalRank(slug: string): number {
  const month = new Date().getMonth() // 0=Jan … 7=Aug
  // Late summer / early fall in Ottawa: outdoor + clean first, snow last.
  if (month >= 3 && month <= 9) {
    const order = ['lawn-garden', 'lawn', 'home-cleaning', 'cleaning', 'handyman', 'snow-removal', 'snow']
    const i = order.findIndex((s) => slug.includes(s) || s.includes(slug))
    return i >= 0 ? i : 50
  }
  // Winter: snow + clean + handyman.
  const winter = ['snow-removal', 'snow', 'home-cleaning', 'cleaning', 'handyman', 'lawn-garden', 'lawn']
  const i = winter.findIndex((s) => slug.includes(s) || s.includes(slug))
  return i >= 0 ? i : 50
}

function costOf(service: BrowsableService, minutes: number) {
  return serviceCostMinutes(minutes, service.credit_multiplier)
}

function preset(days: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function presetLabel(days: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : d.toLocaleDateString('en-CA', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-CA', { hour: 'numeric', hour12: true }).replace(/\s/g, '')
  return `${day} · ${time}`
}

/** Next Saturday (or this Saturday if still upcoming). */
function daysUntilSaturday(): number {
  const day = new Date().getDay() // 0 Sun … 6 Sat
  const delta = (6 - day + 7) % 7
  return delta === 0 ? 7 : delta
}

function hasSavedAddress(defaults: {
  address_line1: string
  city: string
  postal_code: string
}) {
  return Boolean(
    defaults.address_line1.trim() &&
      defaults.city.trim() &&
      defaults.postal_code.trim().length >= 3,
  )
}

export function ServiceBrowser({
  services,
  availableMinutes,
  canBook,
  defaults,
  initialServiceSlug = null,
  initialDurationMinutes,
}: {
  services: BrowsableService[]
  availableMinutes: number
  canBook: boolean
  defaults: { address_line1: string; city: string; postal_code: string }
  initialServiceSlug?: string | null
  initialDurationMinutes?: number
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const didAutoSelect = useRef(false)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<BrowsableService | null>(null)

  const [duration, setDuration] = useState(120)
  const [start, setStart] = useState(() => preset(1, 9))
  const [address, setAddress] = useState(defaults.address_line1)
  const [city, setCity] = useState(defaults.city)
  const [postal, setPostal] = useState(defaults.postal_code)
  const [notes, setNotes] = useState('')
  const [editAddress, setEditAddress] = useState(!hasSavedAddress(defaults))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (didAutoSelect.current || !initialServiceSlug) return
    const match = services.find((s) => s.slug === initialServiceSlug)
    if (!match) return
    didAutoSelect.current = true
    setSelected(match)
    setDuration(
      initialDurationMinutes && initialDurationMinutes >= 30
        ? initialDurationMinutes
        : match.default_duration_minutes,
    )
    setError(null)
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [initialServiceSlug, initialDurationMinutes, services])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape' && selected) setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = services.filter((s) => {
      if (filter === 'quick' && s.default_duration_minutes > 60) return false
      if (filter === 'licensed' && !s.requires_licensed_provider) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
      )
    })
    return filtered.sort((a, b) => seasonalRank(a.slug) - seasonalRank(b.slug))
  }, [services, query, filter])

  function choose(service: BrowsableService) {
    setSelected(service)
    setDuration(service.default_duration_minutes)
    setError(null)
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  function onPostalBlur() {
    const formatted = formatPostalCode(postal)
    if (formatted !== postal) setPostal(formatted)
  }

  const cost = selected ? costOf(selected, duration) : 0
  const { affordable, shortfall, remaining } = affordability(cost, availableMinutes)
  const fsa = postalFsa(postal)

  const durationChips = useMemo(() => {
    if (!selected) return [] as number[]
    const base = selected.default_duration_minutes
    const set = new Set(
      [Math.max(30, base - 30), base, Math.min(600, base + 30), Math.min(600, base + 60)].filter(
        (n) => n >= 30,
      ),
    )
    return Array.from(set).sort((a, b) => a - b)
  }, [selected])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)

    if (!start) return setError('Pick a day and time so we know when to send a pro.')
    if (new Date(start).getTime() < Date.now())
      return setError('That time is in the past — pick a future slot.')
    if (!address.trim() || !city.trim() || !postal.trim())
      return setError('Add your address so the pro knows where to go.')
    if (!affordable)
      return setError(
        `You need about ${formatMinutes(shortfall)} more plan time for this job.`,
      )

    const postalNorm = formatPostalCode(postal)

    setLoading(true)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('request_booking', {
      p_service_id: selected.id,
      p_scheduled_start: new Date(start).toISOString(),
      p_duration_minutes: duration,
      p_address_line1: address,
      p_city: city,
      p_postal_code: postalNorm,
      p_notes: notes,
    })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && (address.trim() || city.trim() || postalNorm.trim())) {
      await supabase
        .from('profiles')
        .update({
          address_line1: address.trim() || null,
          city: city.trim() || null,
          postal_code: postalNorm.trim() || null,
        })
        .eq('id', user.id)
    }

    router.push('/dashboard?booked=1')
    router.refresh()
  }

  if (selected) {
    const sat = daysUntilSaturday()
    const presets: [number, number][] = [
      [0, 14], // today afternoon if still valid
      [1, 9],
      [1, 13],
      [sat, 10],
    ].filter(([d, h]) => {
      const t = new Date()
      t.setDate(t.getDate() + d)
      t.setHours(h, 0, 0, 0)
      return t.getTime() > Date.now() + 30 * 60 * 1000
    }) as [number, number][]

    const savedSummary = [address, city, formatPostalCode(postal)].filter(Boolean).join(' · ')

    return (
      <div ref={panelRef} className="booking-panel rise">
        <button type="button" className="back-link" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} /> All services
        </button>

        <div className="card booking-head">
          <span className="icon-chip icon-chip-lg">
            <ServiceIcon name={selected.icon} size={22} />
          </span>
          <div>
            <h2 style={{ margin: 0 }}>{selected.name}</h2>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {selected.description ?? 'A vetted local pro handles it for you.'}
            </p>
          </div>
        </div>

        <form className="card booking-form" onSubmit={submit} style={{ marginTop: 16 }}>
          {error && <div className="form-error">{error}</div>}

          <p className="tile-label">1 · When should we come?</p>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {presets.map(([d, h]) => {
              const value = preset(d, h)
              return (
                <button
                  key={value}
                  type="button"
                  className={`chip${start === value ? ' chip-on' : ''}`}
                  onClick={() => setStart(value)}
                >
                  {presetLabel(d, h)}
                </button>
              )
            })}
          </div>
          <label htmlFor="start" className="sr-label">
            Or pick an exact date &amp; time
          </label>
          <input
            id="start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />

          <p className="tile-label" style={{ marginTop: 22 }}>
            2 · How long do you need?
          </p>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {durationChips.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${duration === m ? ' chip-on' : ''}`}
                onClick={() => setDuration(m)}
              >
                {m === selected.default_duration_minutes ? `Standard · ${formatMinutes(m)}` : formatMinutes(m)}
              </button>
            ))}
          </div>
          <div className="stepper-row">
            <button
              type="button"
              className="step-btn"
              onClick={() => setDuration((d) => Math.max(30, d - 15))}
              aria-label="15 minutes less"
            >
              <Minus size={18} />
            </button>
            <div className="stepper-value">
              <strong>{formatMinutes(duration)}</strong>
              <small className="muted">pro on site</small>
            </div>
            <button
              type="button"
              className="step-btn"
              onClick={() => setDuration((d) => Math.min(600, d + 15))}
              aria-label="15 minutes more"
            >
              <Plus size={18} />
            </button>
          </div>

          <p className="tile-label" style={{ marginTop: 22 }}>
            3 · Where?
          </p>
          {!editAddress && savedSummary ? (
            <div className="saved-address">
              <MapPin size={16} aria-hidden="true" />
              <span>{savedSummary}</span>
              <button
                type="button"
                className="link-quiet"
                onClick={() => setEditAddress(true)}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Pencil size={14} /> Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                aria-label="Street address"
                autoComplete="street-address"
              />
              <div className="grid grid-2" style={{ gap: 12, marginTop: 10 }}>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  aria-label="City"
                  autoComplete="address-level2"
                />
                <div>
                  <input
                    type="text"
                    value={postal}
                    onChange={(e) => setPostal(e.target.value)}
                    onBlur={onPostalBlur}
                    placeholder="Postal code (K1A 0B1)"
                    aria-label="Postal code"
                    autoComplete="postal-code"
                    inputMode="text"
                  />
                  {fsa.length === 3 && (
                    <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                      Matching Ottawa pros near <strong style={{ color: 'var(--text)' }}>{fsa}</strong>
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <p className="tile-label" style={{ marginTop: 22 }}>
            Anything the pro should know? <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(optional)</span>
          </p>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, pets, parking, key under the mat…"
            aria-label="Notes for the pro"
          />

          <div className="cost-summary">
            <div>
              <span className="muted">From your plan</span>
              <strong className={affordable ? '' : 'over'}>{formatMinutes(cost)}</strong>
            </div>
            <div className="muted cost-after">
              {affordable
                ? `${formatMinutes(remaining)} still available after`
                : `Need ${formatMinutes(shortfall)} more`}
            </div>
          </div>

          <ul className="reassure-list">
            <li>
              <Check size={14} /> Minutes held now — only used when the job is done
            </li>
            <li>
              <Check size={14} /> Cancel free anytime before the pro starts
            </li>
            <li>
              <Check size={14} /> We’ll match a local pro and notify you
            </li>
          </ul>

          <div className="booking-confirm-inline">
            {canBook ? (
              <button
                className="btn btn-primary btn-lg"
                type="submit"
                disabled={loading || !affordable}
                style={{ width: '100%', marginTop: 14 }}
              >
                {loading ? 'Booking…' : 'Book this job'}
              </button>
            ) : (
              <Link
                href="/pricing"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: 14 }}
              >
                Choose a plan to book
              </Link>
            )}
          </div>

          <div className="booking-sticky" aria-hidden={false}>
            <div className="booking-sticky-inner">
              <div className="booking-sticky-cost">
                <span className="muted">From plan</span>
                <strong className={affordable ? '' : 'over'}>{formatMinutes(cost)}</strong>
              </div>
              {canBook ? (
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading || !affordable}
                >
                  {loading ? 'Booking…' : 'Book job'}
                </button>
              ) : (
                <Link href="/pricing" className="btn btn-primary">
                  Get a plan
                </Link>
              )}
            </div>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div>
      <div className="search-wrap">
        <Search size={18} className="search-icon" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="search-input"
          placeholder="Try “clean”, “lawn”, “snow”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="chip-row" style={{ marginTop: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip${filter === f.key ? ' chip-on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="card empty-state" style={{ marginTop: 20 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>No match for “{query}”.</p>
          <p className="muted" style={{ margin: '6px 0 14px' }}>
            Try “cleaning”, “lawn”, or “handyman” — or browse everything.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
          >
            Show all services
          </button>
        </div>
      ) : (
        <div className="service-grid" style={{ marginTop: 20 }}>
          {results.map((s) => {
            const c = costOf(s, s.default_duration_minutes)
            const tooPricey = canBook && c > availableMinutes
            return (
              <button
                key={s.id}
                type="button"
                className="service-card"
                onClick={() => choose(s)}
                aria-label={`Book ${s.name}`}
              >
                <div className="service-card-top">
                  <span className="icon-chip">
                    <ServiceIcon name={s.icon} />
                  </span>
                  {s.requires_licensed_provider && (
                    <span className="tag warn">
                      <ShieldCheck size={12} /> Licensed
                    </span>
                  )}
                </div>
                <h3>{s.name}</h3>
                <p className="muted service-card-desc">
                  {s.description ?? 'A vetted local pro handles it for you.'}
                </p>
                <div className="service-card-foot">
                  <span className="muted">
                    <Clock size={14} /> {formatMinutes(s.default_duration_minutes)} visit
                  </span>
                  <span className={tooPricey ? 'cost-pill over' : 'cost-pill'}>
                    {tooPricey ? 'Needs more time' : `${formatMinutes(c)} from plan`}
                  </span>
                </div>
                <span className="service-card-cta">Book</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
