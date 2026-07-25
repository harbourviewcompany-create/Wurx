import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { CancelBookingButton } from '@/components/CancelBookingButton'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ReviewForm } from '@/components/ReviewForm'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
}

function compact(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h`
}

export default async function Dashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard')

  const [profileRes, subRes, balanceRes, bookingsRes] = await Promise.all([
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
        'id, status, scheduled_start, duration_minutes, services(name, icon), providers(id, business_name, rating)',
      )
      .eq('user_id', user.id)
      .order('scheduled_start', { ascending: false })
      .limit(20),
  ])

  const profile = profileRes.data
  const sub = subRes.data
  const plan = (sub?.plans ?? null) as { name: string; monthly_minutes: number } | null
  const available = balanceRes.data?.available_minutes ?? 0
  const held = balanceRes.data?.held_minutes ?? 0
  const bookings = bookingsRes.data ?? []
  const hasActiveSub = !!sub && ACTIVE_SUB_STATUSES.includes(sub.status)
  const firstName = profile?.full_name?.split(' ')[0]

  // ---- Activation: no plan yet → one screen, one clear action ----
  if (!hasActiveSub) {
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

          <Link
            href="/pricing"
            className="btn btn-primary btn-lg"
            style={{ minWidth: 240 }}
          >
            Choose your plan
          </Link>

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

  // ---- Active plan: the minutes balance as a fuel gauge ----
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

  return (
    <section className="container section">
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
                <stop offset="0%" stopColor="#5b93ff" />
                <stop offset="100%" stopColor="#a98bff" />
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
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
          <h1>{formatMinutes(available)} of service time left</h1>
          <p>
            {held > 0 ? `${formatMinutes(held)} held for upcoming bookings. ` : ''}
            {plan ? `Your ${plan.name} plan` : 'Your plan'}
            {sub?.current_period_end
              ? ` refreshes ${formatDateTime(sub.current_period_end)}.`
              : ' refreshes each month.'}
          </p>
          <Link href="/dashboard/book" className="btn btn-primary">
            Book a service
          </Link>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <p className="tile-label">Plan</p>
          <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>
            {plan?.name ?? 'Plan'}{' '}
            <span className="tag good">{sub?.status}</span>
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
        </div>

        <div className="card">
          <p className="tile-label">Account</p>
          <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>
            {firstName ?? 'You'}
          </p>
          <p className="muted" style={{ margin: '2px 0' }}>
            {profile?.email ?? user.email}
          </p>
        </div>
      </div>

      <div className="section">
        <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
          <h2 style={{ margin: 0 }}>Your bookings</h2>
        </div>
        <div className="card" style={{ marginTop: 6 }}>
          {bookings.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No bookings yet.{' '}
              <Link href="/dashboard/book" style={{ color: 'var(--brand)' }}>
                Book your first service
              </Link>
            </p>
          )}
          {bookings.map((b) => {
            const service = (b.services ?? null) as { name: string; icon: string | null } | null
            const provider = (b.providers ?? null) as
              | { id: string; business_name: string; rating: number | null }
              | null
            const cancellable = b.status === 'requested' || b.status === 'confirmed'
            const needsReview = b.status === 'completed' && !reviewedBookingIds.has(b.id) && provider
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
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={STATUS_TAG[b.status] ?? 'tag'}>{b.status}</span>
                  {cancellable && <CancelBookingButton bookingId={b.id} />}
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
