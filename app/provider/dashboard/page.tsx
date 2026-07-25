import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'
import { ClaimBookingButton } from '@/components/ClaimBookingButton'
import { CompleteBookingButton } from '@/components/CompleteBookingButton'
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

export default async function ProviderDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/provider/dashboard')

  const { data: provider } = await supabase
    .from('providers')
    .select(
      'id, business_name, verification, is_active, service_slugs, base_postal_code, stripe_account_id, payouts_enabled',
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (!provider) redirect('/become-a-pro')

  const [openRes, myBookingsRes, earningsRes, notifRes] = await Promise.all([
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
  ])

  const earnings = earningsRes.data ?? []
  const pendingCents = earnings
    .filter((e) => !e.paid_out_at)
    .reduce((sum, e) => sum + (e.net_cents ?? 0), 0)
  const paidCents = earnings
    .filter((e) => e.paid_out_at)
    .reduce((sum, e) => sum + (e.net_cents ?? 0), 0)

  const openJobs = openRes.data ?? []
  const myBookings = myBookingsRes.data ?? []

  return (
    <section className="container section">
      <div className="list-row" style={{ paddingTop: 0 }}>
        <h1 style={{ margin: 0 }}>{provider.business_name}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={provider.verification === 'verified' ? 'tag good' : 'tag warn'}>
            {provider.verification === 'verified' ? 'Verified' : 'Verification pending'}
          </span>
          <Link href="/provider/profile" className="btn btn-ghost">
            Edit profile
          </Link>
        </div>
      </div>
      {!provider.is_active && (
        <p className="form-note" style={{ marginTop: 4 }}>
          Your profile is inactive, so it won&apos;t appear for new jobs. Contact
          support if this is unexpected.
        </p>
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
        <h2>Open jobs near you</h2>
        <p className="muted" style={{ marginTop: -8 }}>
          Matched to the services on your profile. First to claim gets it.
        </p>
        <div className="card">
          {openJobs.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No open jobs matching your services right now. Check back soon.
            </p>
          )}
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

      <div className="section">
        <h2>Your jobs</h2>
        <div className="card">
          {myBookings.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              No claimed jobs yet. Claim one from the list above.
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
                  {completable && <CompleteBookingButton bookingId={b.id} />}
                </div>
              </div>
            )
          })}
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
