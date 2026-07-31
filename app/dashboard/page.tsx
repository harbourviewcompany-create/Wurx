import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, CheckCircle2, House, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes, formatWindow } from '@/lib/format'
import { CancelBookingButton } from '@/components/CancelBookingButton'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ReviewForm } from '@/components/ReviewForm'
import { ManageSubscriptionButton } from '@/components/ManageSubscriptionButton'
import { NotificationsPanel } from '@/components/NotificationsPanel'
import { MinutesArriving } from '@/components/MinutesArriving'
import { LowBalanceNudge } from '@/components/LowBalanceNudge'
import { ActiveJobCard } from '@/components/ActiveJobCard'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

const STATUS_LABEL: Record<string, string> = {
  requested: 'Finding your professional',
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

const FIRST_JOB_HINTS: { slug: string; label: string; blurb: string }[] = [
  { slug: 'cleaning', label: 'Home cleaning', blurb: 'The easiest first booking' },
  { slug: 'snow-removal', label: 'Snow removal', blurb: 'Seasonal help when you need it' },
  { slug: 'lawn-care', label: 'Lawn care', blurb: 'Keep outdoor work handled' },
]

type DashboardBooking = {
  id: string
  status: string
  scheduled_start: string
  window_end: string | null
  duration_minutes: number
  address_line1: string | null
  city: string | null
  postal_code: string | null
  services: { name: string; icon: string | null; slug: string } | null
  providers: { id: string; business_name: string; rating: number | null } | null
}

function bookingPriority(status: string) {
  if (status === 'in_progress') return 0
  if (status === 'confirmed') return 1
  return 2
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; booked?: string }>
}) {
  const params = await searchParams
  const justPaid = params.success === 'true' || params.success === '1'
  const justBooked = params.booked === '1' || params.booked === 'true'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard')

  const [profileRes, subRes, balanceRes, bookingsRes, notifRes, servicesRes] = await Promise.all([
    supabase.from('profiles').select('full_name, email, phone').eq('id', user.id).single(),
    supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end, plans(name, monthly_minutes)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('available_balances')
      .select('available_minutes, held_minutes')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select(
        'id, status, scheduled_start, window_end, duration_minutes, address_line1, city, postal_code, services(name, icon, slug), providers!provider_id(id, business_name, rating)',
      )
      .eq('user_id', user.id)
      .order('scheduled_start', { ascending: false })
      .limit(20),
    supabase
      .from('notifications')
      .select('id, kind, title, body, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('services').select('slug, name, is_active').eq('is_active', true),
  ])

  const profile = profileRes.data
  const sub = subRes.data
  const plan = (sub?.plans ?? null) as { name: string; monthly_minutes: number } | null
  const available = balanceRes.data?.available_minutes ?? 0
  const held = balanceRes.data?.held_minutes ?? 0
  const bookings = (bookingsRes.data ?? []) as unknown as DashboardBooking[]
  const notifications = notifRes.data ?? []
  const hasActiveSub = !!sub && ACTIVE_SUB_STATUSES.includes(sub.status)
  const firstName = profile?.full_name?.split(' ')[0]
  const activeSlugs = new Set((servicesRes.data ?? []).map((service) => service.slug))
  const awaitingMinutes = justPaid && available <= 0

  if (!hasActiveSub && !awaitingMinutes) {
    return (
      <section className="container section dashboard-shell">
        <div className="activate rise">
          <span className="eyebrow">Welcome{firstName ? `, ${firstName}` : ''}</span>
          <h1>Let Wurx handle the work around your home.</h1>
          <p>
            Choose a plan once, then book cleaning, seasonal work, repairs, and other local help from one simple account.
          </p>
          <div className="stepper">
            <div className="step">
              <span className="step-num">1</span>
              <div>
                <b>Choose your monthly service time</b>
                <small>Pick the amount of help that fits your household.</small>
              </div>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <div>
                <b>Book what you need</b>
                <small>See the exact plan time before you confirm.</small>
              </div>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <div>
                <b>We match a local professional</b>
                <small>Track the visit and receive updates in Wurx.</small>
              </div>
            </div>
          </div>
          <div className="cta-stack">
            <Link href="/pricing" className="btn btn-primary btn-lg">
              View membership plans
            </Link>
            <Link href="/services" className="link-quiet">
              Browse services first
            </Link>
          </div>
          <div className="trust-row" style={{ marginTop: 22 }}>
            <span>
              <ShieldCheck size={16} aria-hidden="true" /> Vetted local professionals
            </span>
            <span>
              <Check size={16} aria-hidden="true" /> Clear plan-time estimates
            </span>
            <span>
              <Check size={16} aria-hidden="true" /> Cancel according to your booking terms
            </span>
          </div>
        </div>
      </section>
    )
  }

  const completedIds = bookings.filter((booking) => booking.status === 'completed').map((booking) => booking.id)
  const { data: existingReviews } =
    completedIds.length > 0
      ? await supabase.from('reviews').select('booking_id').in('booking_id', completedIds)
      : { data: [] as { booking_id: string }[] }
  const reviewedBookingIds = new Set((existingReviews ?? []).map((review) => review.booking_id))

  const { data: photoRows } =
    completedIds.length > 0
      ? await supabase
          .from('booking_photos')
          .select('booking_id, storage_path, caption')
          .in('booking_id', completedIds)
      : { data: [] as { booking_id: string; storage_path: string; caption: string | null }[] }

  const photosByBooking = new Map<string, { url: string; caption: string | null }[]>()
  if (photoRows && photoRows.length > 0) {
    const paths = photoRows.map((photo) => photo.storage_path)
    const { data: signed } = await supabase.storage.from('job-photos').createSignedUrls(paths, 3600)
    const urlByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]))
    for (const row of photoRows) {
      const url = urlByPath.get(row.storage_path)
      if (!url) continue
      const list = photosByBooking.get(row.booking_id) ?? []
      list.push({ url, caption: row.caption })
      photosByBooking.set(row.booking_id, list)
    }
  }

  const firstJobHints = FIRST_JOB_HINTS.filter((hint) => activeSlugs.has(hint.slug))
  const showFirstJobGuide = bookings.length === 0 && available > 0
  const nextBooking = bookings
    .filter((booking) => ['requested', 'confirmed', 'in_progress'].includes(booking.status))
    .sort((a, b) => {
      const priority = bookingPriority(a.status) - bookingPriority(b.status)
      return priority || new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
    })[0]
  const lastCompleted = bookings.find((booking) => booking.status === 'completed')
  const totalTracked = available + held
  const availablePercent = totalTracked > 0 ? Math.round((available / totalTracked) * 100) : 0
  const balanceStyle = {
    '--balance-percent': `${Math.max(0, Math.min(100, availablePercent))}%`,
  } as CSSProperties

  return (
    <section className="container section dashboard-shell">
      <MinutesArriving active={awaitingMinutes} />

      {justBooked && (
        <div className="card dashboard-success rise" role="status">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>Booking requested</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Wurx is matching a vetted local professional for your arrival window. You will be notified when the visit is confirmed.
              {!profile?.phone && ' Add a phone number in Account to receive on-the-way texts.'}
            </p>
          </div>
        </div>
      )}

      <header className="dashboard-header">
        <div>
          <p className="dashboard-kicker">Your home</p>
          <h1 className="dashboard-title">Welcome{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <Link href="/dashboard/book" className="btn btn-primary btn-lg">
          Book a service
        </Link>
      </header>

      <div className="dashboard-overview">
        <article className="card balance-card rise" style={balanceStyle} aria-labelledby="plan-balance-heading">
          <div>
            <p className="tile-label">Available to book</p>
            <h2 id="plan-balance-heading" className="balance-value">
              {awaitingMinutes ? 'Activating' : formatMinutes(available)}
            </h2>
            <p className="balance-caption">
              {awaitingMinutes
                ? 'Your membership is active. Service time will appear here as soon as the payment update finishes.'
                : 'This is the exact service time you can use for a new booking right now.'}
            </p>
          </div>
          <div>
            <div className="balance-progress" aria-hidden="true">
              <span />
            </div>
            <div className="balance-meta">
              <span>{formatMinutes(held)} reserved for upcoming bookings</span>
              <span>
                {plan?.name ?? 'Membership'}
                {sub?.current_period_end ? ` · renews ${formatDateTime(sub.current_period_end)}` : ''}
              </span>
            </div>
          </div>
        </article>

        {nextBooking ? (
          <ActiveJobCard booking={nextBooking} />
        ) : (
          <article className="card next-service-card rise">
            <div>
              <div className="next-service-head">
                <div>
                  <p className="tile-label">Next service</p>
                  <span className="tag">Nothing scheduled</span>
                </div>
                <House size={24} aria-hidden="true" />
              </div>
              <h2>Your schedule is clear</h2>
              <p className="muted">
                Choose a service, arrival window, and visit length. Wurx shows the exact plan time before you confirm.
              </p>
              {lastCompleted?.services?.slug && (
                <p className="muted">
                  Your last service was {lastCompleted.services.name}. You can book the same service and visit length again.
                </p>
              )}
            </div>
            <div className="booking-row-actions">
              <Link href="/dashboard/book" className="btn btn-primary">
                Browse services
              </Link>
              {lastCompleted?.services?.slug && (
                <Link
                  href={`/dashboard/book?service=${encodeURIComponent(lastCompleted.services.slug)}&duration=${lastCompleted.duration_minutes}`}
                  className="btn"
                >
                  Book {lastCompleted.services.name} again
                </Link>
              )}
            </div>
          </article>
        )}
      </div>

      {!awaitingMinutes && <LowBalanceNudge availableMinutes={available} monthlyMinutes={plan?.monthly_minutes ?? 0} />}

      {showFirstJobGuide && (
        <div className="card rise">
          <div className="card-heading" style={{ marginBottom: 8 }}>
            <Sparkles size={19} aria-hidden="true" />
            <h2 style={{ margin: 0, fontSize: 22 }}>Book your first service</h2>
          </div>
          <p className="muted" style={{ margin: '0 0 14px' }}>
            Start with a common household task. Your saved address and plan balance will be carried into the booking.
          </p>
          <div className="grid grid-3" style={{ gap: 12 }}>
            {(firstJobHints.length > 0
              ? firstJobHints
              : [{ slug: '', label: 'Browse services', blurb: 'See every available service' }]
            ).map((hint) => (
              <Link
                key={hint.slug || 'browse'}
                href={hint.slug ? `/dashboard/book?service=${encodeURIComponent(hint.slug)}` : '/dashboard/book'}
                className="card card-hover"
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>{hint.label}</strong>
                <span className="muted" style={{ fontSize: 14 }}>
                  {hint.blurb}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-secondary-grid">
        <article className="card compact-plan-card">
          <p className="tile-label">Membership</p>
          <h2 style={{ margin: '0 0 5px', fontSize: 23 }}>
            {plan?.name ?? (awaitingMinutes ? 'Activating' : 'Your plan')}{' '}
            {sub?.status && <span className="tag good">{sub.status}</span>}
          </h2>
          {plan && (
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {formatMinutes(plan.monthly_minutes)} added each billing period
            </p>
          )}
          <ManageSubscriptionButton />
        </article>

        <article className="card compact-account-card">
          <div className="card-heading">
            <UserRound size={19} aria-hidden="true" />
            <p className="tile-label" style={{ margin: 0 }}>Account</p>
          </div>
          <h2 style={{ margin: '10px 0 4px', fontSize: 23 }}>{firstName ?? 'Your account'}</h2>
          <p className="muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {profile?.email ?? user.email}
          </p>
          {!profile?.phone && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
              Add a phone number to receive “professional on the way” texts.
            </p>
          )}
          <Link href="/dashboard/profile" className="btn" style={{ marginTop: 14 }}>
            Manage account
          </Link>
        </article>
      </div>

      <NotificationsPanel initial={notifications} />

      <section id="bookings" className="dashboard-bookings" aria-labelledby="bookings-heading">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-kicker">Schedule and history</p>
            <h2 id="bookings-heading">Your bookings</h2>
          </div>
          <Link href="/dashboard/book" className="btn">
            New booking
          </Link>
        </div>

        <div className="card booking-list-card">
          {bookings.length === 0 && (
            <div className="empty-state" style={{ paddingBlock: 24 }}>
              <strong>No bookings yet</strong>
              <p className="muted">Choose a service to create your first request.</p>
              <Link href="/dashboard/book" className="btn btn-primary">
                Browse services
              </Link>
            </div>
          )}

          {bookings.map((booking) => {
            const service = booking.services
            const provider = booking.providers
            const cancellable = booking.status === 'requested' || booking.status === 'confirmed'
            const needsReview = booking.status === 'completed' && !reviewedBookingIds.has(booking.id) && provider
            const bookAgainHref = service?.slug
              ? `/dashboard/book?service=${encodeURIComponent(service.slug)}&duration=${booking.duration_minutes}`
              : '/dashboard/book'
            const when = booking.window_end
              ? formatWindow(booking.scheduled_start, booking.window_end)
              : formatDateTime(booking.scheduled_start)
            const photos = photosByBooking.get(booking.id) ?? []

            return (
              <article key={booking.id} className="booking-row">
                <div className="booking-row-main">
                  <strong className="booking-row-title">
                    <ServiceIcon name={service?.icon} size={18} />
                    {service?.name ?? 'Home service'}
                  </strong>
                  <div className="booking-row-meta">
                    {when} · {formatMinutes(booking.duration_minutes)}
                  </div>
                  {provider && (
                    <div className="booking-row-meta">
                      {provider.business_name}
                      {provider.rating != null && ` · ${provider.rating.toFixed(1)} rating`}
                    </div>
                  )}
                </div>

                <div className="booking-row-actions">
                  <span className={STATUS_TAG[booking.status] ?? 'tag'}>
                    {STATUS_LABEL[booking.status] ?? booking.status}
                  </span>
                  {cancellable && <CancelBookingButton bookingId={booking.id} />}
                  {booking.status === 'completed' && (
                    <Link href={bookAgainHref} className="btn btn-ghost">
                      Book again
                    </Link>
                  )}
                </div>

                {needsReview && provider && (
                  <div className="booking-row-extra">
                    <ReviewForm bookingId={booking.id} providerId={provider.id} />
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="booking-row-extra" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {photos.map((photo, index) => (
                      <a key={`${booking.id}-${index}`} href={photo.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.caption ?? `Completed ${service?.name ?? 'service'} photo ${index + 1}`}
                          width={88}
                          height={88}
                          style={{
                            objectFit: 'cover',
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                          }}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}
