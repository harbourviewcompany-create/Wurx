import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { CancelBookingButton } from '@/components/CancelBookingButton'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ReviewForm } from '@/components/ReviewForm'
import { ManageSubscriptionButton } from '@/components/ManageSubscriptionButton'
import { NotificationsPanel } from '@/components/NotificationsPanel'
import { MinutesArriving } from '@/components/MinutesArriving'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

const STATUS_LABEL: Record<string, string> = {
  requested: 'Finding a pro…',
  confirmed: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
}

/** Seasonal first-job suggestions (Ottawa). */
const FIRST_JOB_HINTS: { slug: string; label: string; blurb: string }[] = [
  { slug: 'cleaning', label: 'Home cleaning', blurb: 'Most popular first booking' },
  { slug: 'snow-removal', label: 'Snow removal', blurb: 'Seasonal — book early' },
  { slug: 'lawn-care', label: 'Lawn care', blurb: 'Great for spring & summer' },
]

function compact(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h`
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
    supabase.from('profiles').select('full_name, email').eq('id', user.id).single(),
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
        'id, status, scheduled_start, duration_minutes, services(name, icon, slug), providers(id, business_name, rating)',
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
    supabase
      .from('services')
      .select('slug, name, is_active')
      .eq('is_active', true),
  ])

  const profile = profileRes.data
  const sub = subRes.data
  const plan = (sub?.plans ?? null) as { name: string; monthly_minutes: number } | null
  const available = balanceRes.data?.available_minutes ?? 0
  const held = balanceRes.data?.held_minutes ?? 0
  const bookings = bookingsRes.data ?? []
  const notifications = notifRes.data ?? []
  const hasActiveSub = !!sub && ACTIVE_SUB_STATUSES.includes(sub.status)
  const firstName = profile?.full_name?.split(' ')[0]
  const activeSlugs = new Set((servicesRes.data ?? []).map((s) => s.slug))

  // F3: paid, but grant not visible yet — never show the “choose a plan” wall.
  const awaitingMinutes = justPaid && available <= 0

  // ---- Activation: no plan yet (and not mid-webhook) → one screen ----
  if (!hasActiveSub && !awaitingMinutes) {
    return (
      <section className="container section">
        <div className="activate rise">
          <span className="eyebrow">
            Welcome{firstName ? `, ${firstName}` : ''}
          </span>
          <h1>Let&apos;s get your home handled.</h1>
          <p>
            Pick a plan, book your first service, and hand your to-do list to a
            vetted local pro.
          </p>

          <div className="stepper">
            <div className="step">
              <span className="step-num">1</span>
              <div>
                <b>Choose a plan</b>
                <small>A monthly bank of service time.</small>
              </div>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <div>
                <b>Book a service</b>
                <small>Cleaning, snow, lawn, handyman &amp; more.</small>
              </div>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <div>
                <b>Relax</b>
                <small>A pro shows up and takes care of it.</small>
              </div>
            </div>
          </div>

          <div className="cta-stack">
            <Link
              href="/pricing"
              className="btn btn-primary btn-lg"
              style={{ minWidth: 240 }}
            >
              Choose your plan
            </Link>
            <Link href="/dashboard/book" className="link-quiet">
              or browse what we do first →
            </Link>
          </div>

          <div className="trust-row" style={{ marginTop: 22 }}>
            <span>
              <ShieldCheck size={16} /> Vetted &amp; insured pros
            </span>
            <span>
              <Check size={16} /> No contracts
            </span>
            <span>
              <Check size={16} /> Cancel anytime
            </span>
          </div>
        </div>
      </section>
    )
  }

  // ---- Active plan (or post-checkout lag) ----
  const monthly = plan?.monthly_minutes ?? 0
  const frac =
    monthly > 0
      ? Math.max(0, Math.min(1, available / monthly))
      : available > 0
        ? 1
        : 0
  const R = 52
  const C = 2 * Math.PI * R
  const dashoffset = C * (1 - frac)

  const completedIds = bookings.filter((b) => b.status === 'completed').map((b) => b.id)
  const { data: existingReviews } =
    completedIds.length > 0
      ? await supabase.from('reviews').select('booking_id').in('booking_id', completedIds)
      : { data: [] as { booking_id: string }[] }
  const reviewedBookingIds = new Set((existingReviews ?? []).map((r) => r.booking_id))

  const firstJobHints = FIRST_JOB_HINTS.filter((h) => activeSlugs.has(h.slug))
  const showFirstJobGuide = bookings.length === 0 && available > 0

  return (
    <section className="container section">
      <MinutesArriving active={awaitingMinutes} />

      {justBooked && (
        <div
          className="card rise"
          role="status"
          style={{
            marginBottom: 18,
            borderColor: 'var(--brand)',
            background: 'color-mix(in srgb, var(--brand) 6%, transparent)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Booking requested</p>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            We’re matching a vetted pro for your time window. You’ll see updates here.
          </p>
        </div>
      )}

      <div
        className="list-row"
        style={{ paddingTop: 0, borderBottom: 'none' }}
      >
        <h1 style={{ margin: 0 }}>
          Welcome{firstName ? `, ${firstName}` : ''}
        </h1>
        <Link href="/dashboard/book" className="btn btn-primary btn-lg">
          Book a service
        </Link>
      </div>

      <div className="card dash-hero rise" style={{ marginTop: 6 }}>
        <div className="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1c2b3a" />
                <stop offset="100%" stopColor="#c1440e" />
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="rgba(28,43,58,0.1)"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={dashoffset}
            />
          </svg>
          <div className="ring-center">
            <span className="ring-big">{compact(available)}</span>
            <span className="ring-label">available</span>
          </div>
        </div>

        <div className="dash-hero-body">
          <h1>
            {awaitingMinutes
              ? 'Setting up your service time'
              : `${formatMinutes(available)} of service time left`}
          </h1>
          <p>
            {held > 0 ? `${formatMinutes(held)} held for upcoming bookings. ` : ''}
            {plan ? `Your ${plan.name} plan` : 'Your plan'}
            {sub?.current_period_end
              ? ` refreshes ${formatDateTime(sub.current_period_end)}.`
              : ' refreshes each month.'}
          </p>
          {!awaitingMinutes && (
            <Link href="/dashboard/book" className="btn btn-primary">
              Book a service
            </Link>
          )}
        </div>
      </div>

      {showFirstJobGuide && (
        <div className="card rise" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Sparkles size={18} aria-hidden />
            <h2 style={{ margin: 0, fontSize: 18 }}>Book your first job in 2 minutes</h2>
          </div>
          <p className="muted" style={{ margin: '0 0 14px' }}>
            Pick something common — we’ll use your saved address when you have one,
            and show exactly how many minutes it uses before you confirm.
          </p>
          <div className="grid grid-3" style={{ gap: 12 }}>
            {(firstJobHints.length > 0 ? firstJobHints : [{ slug: '', label: 'Browse services', blurb: 'See everything we do' }]).map(
              (h) => (
                <Link
                  key={h.slug || 'browse'}
                  href={h.slug ? `/dashboard/book?service=${encodeURIComponent(h.slug)}` : '/dashboard/book'}
                  className="card card-hover"
                  style={{ textDecoration: 'none', color: 'inherit', margin: 0 }}
                >
                  <strong style={{ display: 'block', marginBottom: 4 }}>{h.label}</strong>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {h.blurb}
                  </span>
                </Link>
              ),
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link href="/dashboard/book" className="btn btn-primary">
              Choose a service
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <p className="tile-label">Plan</p>
          <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>
            {plan?.name ?? (awaitingMinutes ? 'Activating…' : 'Plan')}{' '}
            {sub?.status && <span className="tag good">{sub.status}</span>}
          </p>
          {plan && (
            <p className="muted" style={{ margin: '2px 0' }}>
              {formatMinutes(plan.monthly_minutes)} refreshed every month
            </p>
          )}
          {sub?.current_period_end && (
            <p className="muted" style={{ margin: '2px 0' }}>
              {sub.cancel_at_period_end ? 'Ends' : 'Renews'}{' '}
              {formatDateTime(sub.current_period_end)}
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <ManageSubscriptionButton />
          </div>
        </div>

        <div className="card">
          <p className="tile-label">Account</p>
          <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>
            {firstName ?? 'You'}
          </p>
          <p className="muted" style={{ margin: '2px 0' }}>
            {profile?.email ?? user.email}
          </p>
          <Link href="/dashboard/profile" style={{ color: 'var(--brand)', fontSize: 14 }}>
            Edit profile
          </Link>
        </div>
      </div>

      <NotificationsPanel initial={notifications} />

      <div className="section">
        <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
          <h2 style={{ margin: 0 }}>Your bookings</h2>
        </div>
        <div className="card" style={{ marginTop: 6 }}>
          {bookings.length === 0 && !showFirstJobGuide && (
            <p className="muted" style={{ margin: 0 }}>
              No bookings yet.{' '}
              <Link href="/dashboard/book" style={{ color: 'var(--brand)' }}>
                Book a service
              </Link>
            </p>
          )}
          {bookings.length === 0 && showFirstJobGuide && (
            <p className="muted" style={{ margin: 0 }}>
              Your list will show up here after you book.
            </p>
          )}
          {bookings.map((b) => {
            const service = (b.services ?? null) as {
              name: string
              icon: string | null
              slug: string
            } | null
            const provider = (b.providers ?? null) as
              | { id: string; business_name: string; rating: number | null }
              | null
            const cancellable = b.status === 'requested' || b.status === 'confirmed'
            const needsReview =
              b.status === 'completed' && !reviewedBookingIds.has(b.id) && provider
            const bookAgainHref =
              service?.slug
                ? `/dashboard/book?service=${encodeURIComponent(service.slug)}&duration=${b.duration_minutes}`
                : '/dashboard/book'
            return (
              <div key={b.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                <div>
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={16} />
                    {service?.name ?? 'Service'}
                  </strong>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
                  </div>
                  {provider && (
                    <div className="muted" style={{ fontSize: 14 }}>
                      {provider.business_name}
                      {provider.rating != null && ` · ★ ${provider.rating.toFixed(1)}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={STATUS_TAG[b.status] ?? 'tag'}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                  {cancellable && <CancelBookingButton bookingId={b.id} />}
                  {b.status === 'completed' && (
                    <Link href={bookAgainHref} className="btn btn-ghost">
                      Book again
                    </Link>
                  )}
                </div>
                {needsReview && provider && (
                  <ReviewForm bookingId={b.id} providerId={provider.id} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
