'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock, Minus, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMinutes } from '@/lib/format'
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
  { key: 'all', label: 'All services' },
  { key: 'quick', label: 'Quick jobs' },
  { key: 'licensed', label: 'Licensed pro' },
]

/** Cost in plan minutes for a given service + duration. */
function costOf(service: BrowsableService, minutes: number) {
  return Math.ceil(minutes * service.credit_multiplier)
}

/** Next occurrence of a given hour, `days` from now, as a datetime-local value. */
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
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString('en-CA', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-CA', { hour: 'numeric', hour12: true }).replace(/\s/g, '')
  return `${day} ${time}`
}

export function ServiceBrowser({
  services,
  availableMinutes,
  canBook,
  defaults,
}: {
  services: BrowsableService[]
  availableMinutes: number
  canBook: boolean
  defaults: { address_line1: string; city: string; postal_code: string }
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<BrowsableService | null>(null)

  // Booking state
  const [duration, setDuration] = useState(120)
  const [start, setStart] = useState('')
  const [address, setAddress] = useState(defaults.address_line1)
  const [city, setCity] = useState(defaults.city)
  const [postal, setPostal] = useState(defaults.postal_code)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // "/" focuses search — a small power-user touch that costs nothing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
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
    return services.filter((s) => {
      if (filter === 'quick' && s.default_duration_minutes > 60) return false
      if (filter === 'licensed' && !s.requires_licensed_provider) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [services, query, filter])

  function choose(service: BrowsableService) {
    setSelected(service)
    setDuration(service.default_duration_minutes)
    setError(null)
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const cost = selected ? costOf(selected, duration) : 0
  const affordable = cost <= availableMinutes
  const shortfall = cost - availableMinutes

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)

    if (!start) return setError('Please choose a date and time.')
    if (new Date(start).getTime() < Date.now()) return setError('Please choose a time in the future.')
    if (!affordable) return setError(`That booking needs ${formatMinutes(shortfall)} more than you have.`)

    setLoading(true)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('request_booking', {
      p_service_id: selected.id,
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

    router.push('/dashboard?booked=1')
    router.refresh()
  }

  // ---------------------------------------------------------------- booking
  if (selected) {
    const presets: [number, number][] = [
      [1, 9],
      [1, 13],
      [2, 9],
    ]

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
              {selected.description ?? 'Booked with the minutes in your plan.'}
            </p>
          </div>
        </div>

        <form className="card" onSubmit={submit} style={{ marginTop: 16 }}>
          {error && <div className="form-error">{error}</div>}

          <p className="tile-label">When should we come?</p>
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
            How long do you need?
          </p>
          <div className="stepper-row">
            <button
              type="button"
              className="step-btn"
              onClick={() => setDuration((d) => Math.max(30, d - 15))}
              aria-label="Decrease by 15 minutes"
            >
              <Minus size={18} />
            </button>
            <div className="stepper-value">
              <strong>{formatMinutes(duration)}</strong>
              <small className="muted">on site</small>
            </div>
            <button
              type="button"
              className="step-btn"
              onClick={() => setDuration((d) => Math.min(600, d + 15))}
              aria-label="Increase by 15 minutes"
            >
              <Plus size={18} />
            </button>
          </div>

          <p className="tile-label" style={{ marginTop: 22 }}>
            Where?
          </p>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
            aria-label="Street address"
          />
          <div className="grid grid-2" style={{ gap: 12, marginTop: 10 }}>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
            />
            <input
              type="text"
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="Postal code"
              aria-label="Postal code"
            />
          </div>

          <p className="tile-label" style={{ marginTop: 22 }}>
            Anything the pro should know?
          </p>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, pets, where to park…"
            aria-label="Notes for the pro"
          />

          <div className="cost-summary">
            <div>
              <span className="muted">This booking uses</span>
              <strong className={affordable ? '' : 'over'}>{formatMinutes(cost)}</strong>
            </div>
            <div className="muted cost-after">
              {affordable
                ? `${formatMinutes(availableMinutes - cost)} left after`
                : `${formatMinutes(shortfall)} short`}
            </div>
          </div>

          {canBook ? (
            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading || !affordable}
              style={{ width: '100%', marginTop: 14 }}
            >
              {loading ? 'Booking…' : 'Confirm booking'}
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
        </form>
      </div>
    )
  }

  // ---------------------------------------------------------------- catalog
  return (
    <div>
      <div className="search-wrap">
        <Search size={18} className="search-icon" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="search-input"
          placeholder="What do you need done?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
        />
        {query && (
          <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
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
          <p style={{ margin: 0, fontWeight: 600 }}>No services match “{query}”.</p>
          <p className="muted" style={{ margin: '6px 0 14px' }}>
            Try a different word, or browse everything.
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
                  {s.description ?? 'Booked with the minutes in your plan.'}
                </p>
                <div className="service-card-foot">
                  <span className="muted">
                    <Clock size={14} /> {formatMinutes(s.default_duration_minutes)} on site
                  </span>
                  <span className={tooPricey ? 'cost-pill over' : 'cost-pill'}>
                    uses {formatMinutes(c)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
