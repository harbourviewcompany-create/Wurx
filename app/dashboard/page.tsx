import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { CancelBookingButton } from '@/components/CancelBookingButton'
import { ServiceIcon } from '@/components/ServiceIcon'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
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
      .select('id, status, scheduled_start, duration_minutes, services(name, icon)')
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

  return (
    <section className="container section">
      <div className="list-row" style={{ paddingTop: 0 }}>
        <h1 style={{ margin: 0 }}>
          Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        {hasActiveSub && (
          <Link href="/dashboard/book" className="btn btn-primary">
            Book a service
          </Link>
        )}
      </div>

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="stat">
            {formatMinutes(available)} <small>available</small>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {held > 0 ? `${formatMinutes(held)} held for upcoming bookings` : 'Minutes ready to spend'}
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Subscription</h3>
          {sub ? (
            <>
              <p style={{ margin: '4px 0' }}>
                {plan?.name ?? 'Plan'}{' '}
                <span className={hasActiveSub ? 'tag good' : 'tag warn'}>{sub.status}</span>
              </p>
              {plan && (
                <p className="muted" style={{ margin: '4px 0' }}>
                  {formatMinutes(plan.monthly_minutes)} / month
                </p>
              )}
              {sub.current_period_end && (
                <p className="muted" style={{ margin: '4px 0' }}>
                  {sub.cancel_at_period_end ? 'Ends' : 'Renews'}{' '}
                  {formatDateTime(sub.current_period_end)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="muted">You don&apos;t have a plan yet.</p>
              <Link href="/pricing" className="btn btn-primary" style={{ marginTop: 8 }}>
                Choose a plan
              </Link>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Account</h3>
          <p className="muted" style={{ margin: '4px 0' }}>{profile?.email ?? user.email}</p>
        </div>
      </div>

      <div className="section">
        <h2>Your bookings</h2>
        <div className="card">
          {bookings.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No bookings yet.{' '}
              {hasActiveSub ? (
                <Link href="/dashboard/book" style={{ color: 'var(--brand)' }}>
                  Book your first service
                </Link>
              ) : (
                <Link href="/pricing" style={{ color: 'var(--brand)' }}>
                  Start a plan
                </Link>
              )}
            </p>
          )}
          {bookings.map((b) => {
            const service = (b.services ?? null) as { name: string; icon: string | null } | null
            const cancellable = b.status === 'requested' || b.status === 'confirmed'
            return (
              <div key={b.id} className="list-row">
                <div>
                  <strong className="card-heading">
                    <ServiceIcon name={service?.icon} size={16} />
                    {service?.name ?? 'Service'}
                  </strong>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={STATUS_TAG[b.status] ?? 'tag'}>{b.status}</span>
                  {cancellable && <CancelBookingButton bookingId={b.id} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
