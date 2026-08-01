import Link from 'next/link'
import { CalendarDays, Clock3, MapPin, Navigation } from 'lucide-react'
import { formatMinutes, formatWindow, mapsSearchUrl } from '@/lib/format'

const STATUS_COPY: Record<string, { label: string; className: string; heading: string }> = {
  requested: {
    label: 'Finding your professional',
    className: 'tag warn',
    heading: 'Service requested',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'tag good',
    heading: 'Your next visit',
  },
  in_progress: {
    label: 'In progress',
    className: 'tag good',
    heading: 'Your professional is on the job',
  },
}

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
  const state = STATUS_COPY[booking.status] ?? {
    label: booking.status,
    className: 'tag',
    heading: 'Upcoming service',
  }
  const when = booking.window_end
    ? formatWindow(booking.scheduled_start, booking.window_end)
    : new Date(booking.scheduled_start).toLocaleDateString('en-CA', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

  return (
    <article className="card next-service-card rise" aria-labelledby={`booking-${booking.id}`}>
      <div>
        <div className="next-service-head">
          <div>
            <p className="tile-label">{state.heading}</p>
            <span className={state.className}>{state.label}</span>
          </div>
          <CalendarDays size={24} aria-hidden="true" />
        </div>
        <h2 id={`booking-${booking.id}`}>{booking.services?.name ?? 'Home service'}</h2>
        <div className="next-service-details">
          <span>
            <CalendarDays size={17} aria-hidden="true" /> {when}
          </span>
          <span>
            <Clock3 size={17} aria-hidden="true" /> {formatMinutes(booking.duration_minutes)} visit
          </span>
          {booking.providers && (
            <span>
              <MapPin size={17} aria-hidden="true" /> {booking.providers.business_name}
              {booking.providers.rating != null && ` · ${booking.providers.rating.toFixed(1)} rating`}
            </span>
          )}
        </div>
      </div>
      <div className="booking-row-actions">
        <Link href="/dashboard#bookings" className="btn btn-primary">
          View booking
        </Link>
        {mapUrl && booking.status === 'in_progress' && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn">
            <Navigation size={16} aria-hidden="true" /> Open map
          </a>
        )}
      </div>
    </article>
  )
}
