import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BriefcaseBusiness, ClipboardCheck, MapPin, ShieldCheck, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes, mapsSearchUrl } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ClaimBookingButton } from '@/components/ClaimBookingButton'
import { StartBookingButton } from '@/components/StartBookingButton'
import { CompleteBookingButton } from '@/components/CompleteBookingButton'
import { ReleaseBookingButton } from '@/components/ReleaseBookingButton'
import { OfferRespondButtons } from '@/components/OfferRespondButtons'
import { PayoutsCard } from '@/components/PayoutsCard'
import { NotificationsPanel } from '@/components/NotificationsPanel'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  requested: 'Open',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_TAG: Record<string, string> = {
  requested: 'tag warn',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
}

export default async function ProviderDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/provider/dashboard')

  const { data: provider } = await supabase
    .from('providers')
    .select(
      'id, business_name, verification, is_active, service_slugs, base_postal_code, stripe_account_id, payouts_enabled, rating',
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (!provider) redirect('/become-a-pro')

  const [offersRes, openRes, myBookingsRes, earningsRes, notifRes, reviewsRes] = await Promise.all([
    supabase
      .from('job_offers')
      .select(
        'id, expires_at, offered_at, booking_id, bookings(id, scheduled_start, duration_minutes, address_line1, city, postal_code, notes, status, provider_id, services(name, icon))',
      )
      .eq('provider_id', provider.id)
      .eq('status', 'offered')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(30),
    supabase
      .from('bookings')
      .select(
        'id, scheduled_start, duration_minutes, address_line1, city, postal_code, notes, services(name, icon)',
      )
      .eq('status', 'requested')
      .is('provider_id', null)
      .order('scheduled_start', { ascending: true })
      .limit(30),
    supabase
      .from('bookings')
      .select(
        'id, status, scheduled_start, duration_minutes, address_line1, city, postal_code, services(name, icon)',
      )
      .eq('provider_id', provider.id)
      .order('scheduled_start', { ascending: false })
      .limit(20),
    supabase.from('provider_earnings').select('net_cents, paid_out_at').eq('provider_id', provider.id),
    supabase
      .from('notifications')
      .select('id, kind, title, body, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const earnings = earningsRes.data ?? []
  const pendingCents = earnings
    .filter((earning) => !earning.paid_out_at)
    .reduce((sum, earning) => sum + (earning.net_cents ?? 0), 0)
  const paidCents = earnings
    .filter((earning) => earning.paid_out_at)
    .reduce((sum, earning) => sum + (earning.net_cents ?? 0), 0)

  type BookingSnippet = {
    id: string
    scheduled_start: string
    duration_minutes: number
    address_line1?: string | null
    city: string | null
    postal_code?: string | null
    notes?: string | null
    status?: string
    provider_id?: string | null
    services: { name: string; icon: string | null } | null
  }

  const offers = (offersRes.data ?? [])
    .map((offer) => {
      const booking = (offer.bookings ?? null) as BookingSnippet | null
      return { id: offer.id, expires_at: offer.expires_at, booking }
    })
    .filter((offer) => offer.booking && offer.booking.status === 'requested' && !offer.booking.provider_id)

  const offeredBookingIds = new Set(offers.map((offer) => offer.booking!.id))
  const openJobs = (openRes.data ?? []).filter((booking) => !offeredBookingIds.has(booking.id))
  const myBookings = myBookingsRes.data ?? []
  const reviews = reviewsRes.data ?? []
  const verificationReady = provider.verification === 'verified' && provider.is_active

  return (
    <section className="container section provider-shell">
      <header className="provider-header rise">
        <div>
          <p className="dashboard-kicker">Professional workspace</p>
          <h1>{provider.business_name}</h1>
          <div className="provider-status-row">
            <span className={provider.verification === 'verified' ? 'tag good' : 'tag warn'}>
              <ShieldCheck size={14} aria-hidden="true" />
              {provider.verification === 'verified' ? 'Identity verified' : 'Application under review'}
            </span>
            {provider.rating != null && (
              <span className="tag">
                <Star size={14} aria-hidden="true" /> {provider.rating.toFixed(1)} rating
              </span>
            )}
          </div>
        </div>
        <Link href="/provider/profile" className="btn">
          Edit professional profile
        </Link>
      </header>

      {!verificationReady && (
        <section className="card provider-setup-card" aria-labelledby="provider-setup-heading">
          <div className="card-heading">
            <ClipboardCheck size={22} aria-hidden="true" />
            <h2 id="provider-setup-heading" style={{ margin: 0, fontSize: 24 }}>
              {provider.verification === 'verified' ? 'Profile temporarily inactive' : 'Application review in progress'}
            </h2>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {provider.verification === 'verified'
              ? 'New offers are paused for this profile. Review your professional profile or contact support if this was unexpected.'
              : 'Wurx is reviewing your professional application. Job offers will appear here automatically after verification is complete.'}
          </p>
        </section>
      )}

      <PayoutsCard
        payoutsEnabled={!!provider.payouts_enabled}
        hasAccount={!!provider.stripe_account_id}
        pendingCents={pendingCents}
        paidCents={paidCents}
      />

      <NotificationsPanel initial={notifRes.data ?? []} />

      <section id="offers" className="provider-section" aria-labelledby="offers-heading">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-kicker">Matched opportunities</p>
            <h2 id="offers-heading">Offers for you</h2>
          </div>
          {offers.length > 0 && <span className="tag good">{offers.length} available</span>}
        </div>
        <p className="muted provider-section-copy">
          These requests match your services, area, and availability. Review the details before accepting.
        </p>
        <div className="card provider-list-card">
          {offers.length === 0 && (
            <div className="empty-state">
              <BriefcaseBusiness size={26} aria-hidden="true" />
              <h3>No open offers right now</h3>
              <p className="muted">New matching requests will appear here automatically.</p>
            </div>
          )}
          {offers.map((offer) => {
            const booking = offer.booking!
            const service = booking.services
            const left = minutesLeft(offer.expires_at)
            const maps = mapsSearchUrl({
              address_line1: booking.address_line1,
              city: booking.city,
              postal_code: booking.postal_code,
            })
            const where = [booking.address_line1, booking.city, booking.postal_code].filter(Boolean).join(', ')

            return (
              <article key={offer.id} className="offer-card">
                <div className="offer-card-main">
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={18} />
                    {service?.name ?? 'Home service'}
                  </strong>
                  <div className="booking-row-meta">
                    {formatDateTime(booking.scheduled_start)} · {formatMinutes(booking.duration_minutes)} on site
                  </div>
                  {where && (
                    <div className="booking-row-meta">
                      <MapPin size={15} aria-hidden="true" /> {where}
                      {maps && (
                        <>
                          {' · '}
                          <a href={maps} target="_blank" rel="noopener noreferrer" className="provider-link">
                            Open map
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {booking.notes?.trim() && (
                    <p style={{ margin: '9px 0 0', fontSize: 14 }}>
                      <span className="muted">Customer notes: </span>
                      {booking.notes.trim()}
                    </p>
                  )}
                  <span className={left <= 5 ? 'tag warn' : 'tag'} style={{ marginTop: 11 }}>
                    {left <= 0 ? 'Offer expiring' : `${left} minutes to respond`}
                  </span>
                </div>
                <OfferRespondButtons offerId={offer.id} fullWidth />
              </article>
            )
          })}
        </div>
      </section>

      {openJobs.length > 0 && (
        <section className="provider-section" aria-labelledby="nearby-heading">
          <div className="dashboard-section-head">
            <div>
              <p className="dashboard-kicker">Additional work</p>
              <h2 id="nearby-heading">Open jobs near you</h2>
            </div>
          </div>
          <p className="muted provider-section-copy">Available requests you can claim without a direct offer.</p>
          <div className="card provider-list-card">
            {openJobs.map((booking) => {
              const service = (booking.services ?? null) as { name: string; icon: string | null } | null
              const maps = mapsSearchUrl({
                address_line1: booking.address_line1,
                city: booking.city,
                postal_code: booking.postal_code,
              })
              const where = [booking.address_line1, booking.city, booking.postal_code].filter(Boolean).join(', ')

              return (
                <article key={booking.id} className="provider-job-row">
                  <div>
                    <strong className="card-heading">
                      <ServiceIcon name={service?.icon} size={18} />
                      {service?.name ?? 'Home service'}
                    </strong>
                    <div className="booking-row-meta">
                      {formatDateTime(booking.scheduled_start)} · {formatMinutes(booking.duration_minutes)}
                    </div>
                    {where && <div className="booking-row-meta">{where}</div>}
                    {maps && (
                      <a href={maps} target="_blank" rel="noopener noreferrer" className="provider-link">
                        Open map
                      </a>
                    )}
                    {booking.notes?.trim() && (
                      <p className="muted" style={{ margin: '5px 0 0', fontSize: 13 }}>
                        {booking.notes.trim()}
                      </p>
                    )}
                  </div>
                  <ClaimBookingButton bookingId={booking.id} />
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section id="jobs" className="provider-section" aria-labelledby="jobs-heading">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-kicker">Your schedule</p>
            <h2 id="jobs-heading">Your jobs</h2>
          </div>
        </div>
        <div className="card provider-list-card">
          {myBookings.length === 0 && (
            <div className="empty-state">
              <BriefcaseBusiness size={26} aria-hidden="true" />
              <h3>No accepted jobs yet</h3>
              <p className="muted">Accept an offer above when one becomes available.</p>
            </div>
          )}
          {myBookings.map((booking) => {
            const service = (booking.services ?? null) as { name: string; icon: string | null } | null
            const canStart = booking.status === 'confirmed'
            const completable = booking.status === 'confirmed' || booking.status === 'in_progress'
            const maps = mapsSearchUrl({
              address_line1: booking.address_line1,
              city: booking.city,
              postal_code: booking.postal_code,
            })

            return (
              <article key={booking.id} className="provider-job-row">
                <div>
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={18} />
                    {service?.name ?? 'Home service'}
                  </strong>
                  <div className="booking-row-meta">
                    {formatDateTime(booking.scheduled_start)} · {formatMinutes(booking.duration_minutes)}
                    {booking.city ? ` · ${booking.city}` : ''}
                  </div>
                  {maps && completable && (
                    <a href={maps} target="_blank" rel="noopener noreferrer" className="provider-link">
                      Open map
                    </a>
                  )}
                </div>
                <div className="booking-row-actions">
                  <span className={STATUS_TAG[booking.status] ?? 'tag'}>
                    {STATUS_LABEL[booking.status] ?? booking.status}
                  </span>
                  {canStart && <StartBookingButton bookingId={booking.id} />}
                  {completable && <ReleaseBookingButton bookingId={booking.id} />}
                  {completable && <CompleteBookingButton bookingId={booking.id} />}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="provider-section" aria-labelledby="reviews-heading">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-kicker">Customer feedback</p>
            <h2 id="reviews-heading">Recent reviews</h2>
          </div>
        </div>
        <div className="card provider-list-card">
          {reviews.length === 0 && (
            <div className="empty-state">
              <Star size={26} aria-hidden="true" />
              <h3>No reviews yet</h3>
              <p className="muted">Customer ratings will appear after completed jobs.</p>
            </div>
          )}
          {reviews.map((review) => (
            <article key={review.id} className="provider-review-row">
              <div aria-label={`${review.rating} out of 5 stars`}>
                <span style={{ color: 'var(--brand)' }}>{'★'.repeat(review.rating)}</span>
                <span className="muted">{'★'.repeat(5 - review.rating)}</span>
              </div>
              {review.comment && <p style={{ margin: '5px 0 0' }}>{review.comment}</p>}
              <time className="activity-time" dateTime={review.created_at}>
                {formatDateTime(review.created_at)}
              </time>
            </article>
          ))}
        </div>
      </section>

      <p className="form-note">
        <Link href="/dashboard" className="provider-link">
          Switch to the homeowner experience
        </Link>
      </p>
    </section>
  )
}
