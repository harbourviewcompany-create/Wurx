'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  Mic,
  Minus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMinutes, formatPostalCode, postalFsa } from '@/lib/format'
import {
  affordability,
  providersForService,
  serviceCostMinutes,
  type RepeatProvider,
} from '@/lib/booking'
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

/** A pro the customer has already had on site, offerable for a repeat booking. */
export type PastProvider = RepeatProvider

type Filter = 'all' | 'quick' | 'licensed'

/** Guaranteed 2-hour arrival windows (start hour local). */
const WINDOWS: { hour: number; label: string }[] = [
  { hour: 8, label: '8–10am' },
  { hour: 10, label: '10am–12pm' },
  { hour: 12, label: '12–2pm' },
  { hour: 14, label: '2–4pm' },
  { hour: 16, label: '4–6pm' },
]

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'quick', label: 'Under 1 hour' },
  { key: 'licensed', label: 'Licensed pro' },
]

function seasonalRank(slug: string): number {
  const month = new Date().getMonth()
  if (month >= 3 && month <= 9) {
    const order = ['lawn-garden', 'lawn', 'home-cleaning', 'cleaning', 'handyman', 'snow-removal', 'snow']
    const i = order.findIndex((s) => slug.includes(s) || s.includes(slug))
    return i >= 0 ? i : 50
  }
  const winter = ['snow-removal', 'snow', 'home-cleaning', 'cleaning', 'handyman', 'lawn-garden', 'lawn']
  const i = winter.findIndex((s) => slug.includes(s) || s.includes(slug))
  return i >= 0 ? i : 50
}

function costOf(service: BrowsableService, minutes: number) {
  return serviceCostMinutes(minutes, service.credit_multiplier)
}

function dayOffsetLabel(days: number) {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

function windowStartIso(days: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

function windowEndIso(days: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour + 2, 0, 0, 0)
  return d.toISOString()
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
  pastProviders = [],
}: {
  services: BrowsableService[]
  availableMinutes: number
  canBook: boolean
  defaults: { address_line1: string; city: string; postal_code: string }
  initialServiceSlug?: string | null
  initialDurationMinutes?: number
  pastProviders?: PastProvider[]
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const didAutoSelect = useRef(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<BrowsableService | null>(null)

  const [duration, setDuration] = useState(120)
  const [dayOffset, setDayOffset] = useState(1)
  const [windowHour, setWindowHour] = useState(9)
  const [address, setAddress] = useState(defaults.address_line1)
  const [city, setCity] = useState(defaults.city)
  const [postal, setPostal] = useState(defaults.postal_code)
  const [notes, setNotes] = useState('')
  const [preferredProviderId, setPreferredProviderId] = useState<string | null>(null)
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

  function startVoice() {
    const SR =
      typeof window !== 'undefined'
        ? (window as unknown as {
            SpeechRecognition?: new () => SpeechRecognition
            webkitSpeechRecognition?: new () => SpeechRecognition
          }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
            .webkitSpeechRecognition
        : undefined
    if (!SR) {
      setError('Voice search needs Safari or Chrome on this device.')
      return
    }
    const rec = new SR()
    rec.lang = 'en-CA'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0]?.[0]?.transcript ?? ''
      if (text) setQuery(text)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

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

  // Only pros who actually cover the chosen service. Offering one who doesn't
  // would look like a choice but silently fall through to an open fan-out,
  // since dispatch skips a favourite who can't serve the job.
  const eligibleProviders = useMemo(
    () => providersForService(pastProviders, selected?.slug),
    [pastProviders, selected],
  )

  useEffect(() => {
    if (preferredProviderId && !eligibleProviders.some((p) => p.id === preferredProviderId)) {
      setPreferredProviderId(null)
    }
  }, [eligibleProviders, preferredProviderId])

  const dayOptions = [0, 1, 2, 3].filter((d) => {
    // keep at least one window in the future for this day
    return WINDOWS.some((w) => new Date(windowStartIso(d, w.hour)).getTime() > Date.now() + 45 * 60 * 1000)
  })

  const availableWindows = WINDOWS.filter(
    (w) => new Date(windowStartIso(dayOffset, w.hour)).getTime() > Date.now() + 45 * 60 * 1000,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)

    const startIso = windowStartIso(dayOffset, windowHour)
    const endIso = windowEndIso(dayOffset, windowHour)
    if (new Date(startIso).getTime() < Date.now())
      return setError('That window is in the past — pick another.')
    if (!address.trim() || !city.trim() || !postal.trim())
      return setError('Add your address so the pro knows where to go.')
    if (!affordable)
      return setError(`You need about ${formatMinutes(shortfall)} more plan time for this job.`)

    const postalNorm = formatPostalCode(postal)

    setLoading(true)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('request_booking', {
      p_service_id: selected.id,
      p_scheduled_start: startIso,
      p_duration_minutes: duration,
      p_address_line1: address,
      p_city: city,
      p_postal_code: postalNorm,
      p_notes: notes,
      p_window_end: endIso,
      p_preferred_provider_id: preferredProviderId,
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

          <p className="tile-label">1 · Which day?</p>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {dayOptions.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip${dayOffset === d ? ' chip-on' : ''}`}
                onClick={() => {
                  setDayOffset(d)
                  const first = WINDOWS.find(
                    (w) =>
                      new Date(windowStartIso(d, w.hour)).getTime() > Date.now() + 45 * 60 * 1000,
                  )
                  if (first) setWindowHour(first.hour)
                }}
              >
                {dayOffsetLabel(d)}
              </button>
            ))}
          </div>

          <p className="tile-label">Arrival window (guaranteed)</p>
          <div className="chip-row" style={{ marginBottom: 8 }}>
            {availableWindows.map((w) => (
              <button
                key={w.hour}
                type="button"
                className={`chip${windowHour === w.hour ? ' chip-on' : ''}`}
                onClick={() => setWindowHour(w.hour)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
            A pro arrives sometime in this window — no exact minute to babysit.
          </p>

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
                {m === selected.default_duration_minutes
                  ? `Standard · ${formatMinutes(m)}`
                  : formatMinutes(m)}
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
                      Matching Ottawa pros near{' '}
                      <strong style={{ color: 'var(--text)' }}>{fsa}</strong>
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <p className="tile-label" style={{ marginTop: 22 }}>
            Anything the pro should know?{' '}
            <span
              className="muted"
              style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}
            >
              (optional)
            </span>
          </p>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, pets, parking, key under the mat…"
            aria-label="Notes for the pro"
          />

          {eligibleProviders.length > 0 && (
            <>
              <p className="tile-label" style={{ marginTop: 22 }}>
                Want the same pro?{' '}
                <span
                  className="muted"
                  style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}
                >
                  (optional)
                </span>
              </p>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className={`chip${preferredProviderId === null ? ' chip-on' : ''}`}
                  onClick={() => setPreferredProviderId(null)}
                >
                  First available
                </button>
                {eligibleProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip${preferredProviderId === p.id ? ' chip-on' : ''}`}
                    onClick={() => setPreferredProviderId(p.id)}
                  >
                    {p.business_name}
                    {p.rating != null && ` · ★ ${p.rating.toFixed(1)}`}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                {preferredProviderId
                  ? 'They get first refusal. If they’re not free, we open it to other vetted pros so your job still gets done.'
                  : 'We’ll match you with the first vetted pro who takes the job.'}
              </p>
            </>
          )}

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
              <Check size={14} /> We’ll text you when your pro is on the way
            </li>
          </ul>

          <div className="booking-confirm-inline">
            {canBook ? (
              <button
                className="btn btn-primary btn-lg"
                type="submit"
                disabled={loading || !affordable || availableWindows.length === 0}
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
                  disabled={loading || !affordable || availableWindows.length === 0}
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
          placeholder="Describe the job — or try “lawn”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
          enterKeyHint="search"
        />
        <button
          type="button"
          className={`search-mic${listening ? ' search-mic-on' : ''}`}
          onClick={startVoice}
          aria-label={listening ? 'Listening…' : 'Voice search'}
          title="Voice search"
        >
          <Mic size={16} />
        </button>
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

// Minimal SpeechRecognition typings for browsers that support it
interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onend: ((ev: Event) => void) | null
}
interface SpeechRecognitionEvent extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}
