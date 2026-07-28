import Link from 'next/link'
import { MapPin, Navigation } from 'lucide-react'
import { formatDateTime, formatMinutes, mapsSearchUrl } from '@/lib/format'

export function ActiveJobCard({
  booking,
}: {
  booking: {
    id: string
    status: string
    scheduled_start: string
    window_end?: string | null
    duration_minutes: number
    address_line1?: string | null
    city?: string | null
    postal_code?: string | null
    services?: { name: string; slug: string } | null
    providers?: { business_name: string; rating: number | null } | null
  }
}) {
  const mapUrl = mapsSearchUrl({
    address_line1: booking.address_line1,
    city: booking.city,
    postal_code: booking.postal_code,
  })
  const enRoute = booking.status === 'in_progress'
  const title = enRoute ? 'Pro en route / on site' : 'Upcoming visit'
  const windowLabel = booking.window_end
    ? `${formatDateTime(booking.scheduled_start)} – ${formatDateTime(booking.window_end).split(',').pop()?.trim() ?? ''}`
    : formatDateTime(booking.scheduled_start)

  return (
    <div
      className="card rise"
      style={{
        marginTop: 18,
        borderColor: enRoute ? 'var(--brand)' : undefined,
        background: enRoute
          ? 'color-mix(in srgb, var(--brand) 7%, transparent)'
          : undefined,
      }}
    >
      <p className="tile-label" style={{ marginBottom: 4 }}>
        {title}
      </p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>
        {booking.services?.name ?? 'Service'}
      </h2>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        {windowLabel} · {formatMinutes(booking.duration_minutes)}
      </p>
      {booking.providers && (
        <p style={{ margin: '0 0 12px', fontWeight: 600 }}>
          {booking.providers.business_name}
          {booking.providers.rating != null && ` · ★ ${booking.providers.rating.toFixed(1)}`}
        </p>
      )}
      {(booking.address_line1 || booking.city) && (
        <p className="muted" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '0 0 14px' }}>
          <MapPin size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          {[booking.address_line1, booking.city, booking.postal_code].filter(Boolean).join(', ')}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <Navigation size={16} /> Open map
          </a>
        )}
        {booking.services?.slug && booking.status === 'completed' && (
          <Link
            href={`/dashboard/book?service=${encodeURIComponent(booking.services.slug)}&duration=${booking.duration_minutes}`}
            className="btn"
          >
            Book again
          </Link>
        )}
      </div>
    </div>
  )
}
