import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ClaimBookingButton } from '@/components/ClaimBookingButton'
import { CompleteBookingButton } from '@/components/CompleteBookingButton'
import { ReleaseBookingButton } from '@/components/ReleaseBookingButton'
import { OfferRespondButtons } from '@/components/OfferRespondButtons'
import { PayoutsCard } from '@/components/PayoutsCard'
import { NotificationsPanel } from '@/components/NotificationsPanel'

export const dynamic = 'force-dynamic'

const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
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
        'id, expires_at, offered_at, booking_id, bookings(id, scheduled_start, duration_minutes, city, postal_code, status, provider_id, services(name, icon))',
      )
      .eq('provider_id', provider.id)
      .eq('status', 'offered')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(30),
    supabase
      .from('bookings')
      .select('id, scheduled_start, duration_minutes, city, postal_code, services(name, icon)')
      .eq('status', 'requested')
      .is('provider_id', null)
      .order('scheduled_start', { ascending: true })
      .limit(30),
    supabase
      .from('bookings')
      .select('id, status, scheduled_start, duration_minutes, city, services(name, icon)')
      .eq('provider_id', provider.id)
      .order('scheduled_start', { ascending: false })
      .limit(20),
    supabase
      .from('provider_earnings')
      .select('net_cents, paid_out_at')
      .eq('provider_id', provider.id),
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
    .filter((e) => !e.paid_out_at)
    .reduce((sum, e) => sum + (e.net_cents ?? 0), 0)
  const paidCents = earnings
    .filter((e) => e.paid_out_at)
    .reduce((sum, e) => sum + (e.net_cents ?? 0), 0)

  type BookingSnippet = {
    id: string
    scheduled_start: string
    duration_minutes: number
    city: string | null
    postal_code?: string | null
    status?: string
    provider_id?: string | null
    services: { name: string; icon: string | null } | null
  }

  const offers = (offersRes.data ?? [])
    .map((o) => {
      const booking = (o.bookings ?? null) as BookingSnippet | null
      return {
        id: o.id,
        expires_at: o.expires_at,
        booking,
      }
    })
    .filter((o) => o.booking && o.booking.status === 'requested' && !o.booking.provider_id)

  const offeredBookingIds = new Set(offers.map((o) => o.booking!.id))
  // Open pool excludes jobs already offered to this provider (those live in Offers).
  const openJobs = (openRes.data ?? []).filter((b) => !offeredBookingIds.has(b.id))
  const myBookings = myBookingsRes.data ?? []
  const reviews = reviewsRes.data ?? []

  return (
    <section className="container section">
      <div className="list-row" style={{ paddingTop: 0 }}>
        <h1 style={{ margin: 0 }}>{provider.business_name}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={provider.verification === 'verified' ? 'tag good' : 'tag warn'}>
            {provider.verification === 'verified' ? 'Verified' : 'Verification pending'}
          </span>
          {provider.rating != null && <span className="tag">★ {provider.rating.toFixed(1)}</span>}
          <Link href="/provider/profile" className="btn btn-ghost">
            Edit profile
          </Link>
        </div>
      </div>
      {provider.verification !== 'verified' ? (
        <p className="form-note" style={{ marginTop: 4 }}>
          We're reviewing your application. Job offers will appear here
          once you're verified.
        </p>
      ) : (
        !provider.is_active && (
          <p className="form-note" style={{ marginTop: 4 }}>
            Your profile is inactive, so it won't appear for new jobs.
            Contact support if this is unexpected.
          </p>
        )
      )}

      <div style={{ marginTop: 18 }}>
        <PayoutsCard
          payoutsEnabled={!!provider.payouts_enabled}
          hasAccount={!!provider.stripe_account_id}
          pendingCents={pendingCents}
          paidCents={paidCents}
        />
      </div>

      <NotificationsPanel initial={notifRes.data ?? []} />

      <div className="section">
        <h2>Offers for you</h2>
        <p className="muted" style={{ marginTop: -8 }}>
          Matched to your services, area, and availability. Accept before the
          timer runs out — first accept wins.
        </p>
        <div className="card">
          {offers.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No open offers right now. New bookings that match you will show
              up here automatically.
            </p>
          )}
          {offers.map((o) => {
            const b = o.booking!
            const service = b.services
            const left = minutesLeft(o.expires_at)
            return (
              <div key={o.id} className="list-row" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={16} />
                    {service?.name ?? 'Service'}
                  </strong>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
                    {b.city ? ` · ${b.city}` : ''}
                  </div>
                  <div className={left <= 5 ? 'tag warn' : 'tag'} style={{ marginTop: 6 }}>
                    {left <= 0 ? 'Expiring…' : `${left} min left`}
                  </div>
                </div>
                <OfferRespondButtons offerId={o.id} />
              </div>
            )
          })}
        </div>
      </div>

      {openJobs.length > 0 && (
        <div className="section">
          <h2>Open jobs near you</h2>
          <p className="muted" style={{ marginTop: -8 }}>
            Jobs you can still claim without a formal offer. First to claim gets
            it.
          </p>
          <div className="card">
            {openJobs.map((b) => {
              const service = (b.services ?? null) as { name: string; icon: string | null } | null
              return (
                <div key={b.id} className="list-row">
                  <div>
                    <strong className="card-heading">
                      <ServiceIcon name={service?.icon} size={16} />
                      {service?.name ?? 'Service'}
                    </strong>
                    <div className="muted" style={{ fontSize: 14 }}>
                      {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
                      {b.city ? ` · ${b.city}` : ''}
                    </div>
                  </div>
                  <ClaimBookingButton bookingId={b.id} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="section">
        <h2>Your jobs</h2>
        <div className="card">
          {myBookings.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No jobs yet. Accept an offer above when one comes in.
            </p>
          )}
          {myBookings.map((b) => {
            const service = (b.services ?? null) as { name: string; icon: string | null } | null
            const completable = b.status === 'confirmed' || b.status === 'in_progress'
            return (
              <div key={b.id} className="list-row">
                <div>
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={16} />
                    {service?.name ?? 'Service'}
                  </strong>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
                    {b.city ? ` · ${b.city}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={STATUS_TAG[b.status] ?? 'tag'}>{b.status}</span>
                  {completable && <ReleaseBookingButton bookingId={b.id} />}
                  {completable && <CompleteBookingButton bookingId={b.id} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="section">
        <h2>Recent reviews</h2>
        <div className="card">
          {reviews.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No reviews yet. They'll show up here once customers rate a
              completed job.
            </p>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="list-row" style={{ display: 'block' }}>
              <div>
                <span style={{ color: 'var(--brand)' }}>{'★'.repeat(r.rating)}</span>
                <span className="muted">{'★'.repeat(5 - r.rating)}</span>
              </div>
              {r.comment && <p style={{ margin: '4px 0 0' }}>{r.comment}</p>}
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {formatDateTime(r.created_at)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="form-note">
        <Link href="/dashboard" style={{ color: 'var(--brand)' }}>
          Switch to customer dashboard
        </Link>
      </p>
    </section>
  )
}
