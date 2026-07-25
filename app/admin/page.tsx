import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { AdminProviderRow } from '@/components/AdminProviderRow'
import { AdminBookingRow } from '@/components/AdminBookingRow'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [providersRes, openBookingsRes, activeProvidersRes] = await Promise.all([
    supabase
      .from('providers')
      .select('id, business_name, verification, is_active, service_slugs, base_postal_code, rating')
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, scheduled_start, duration_minutes, city, postal_code, status, services(name, slug)')
      .in('status', ['requested', 'confirmed'])
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('providers')
      .select('id, business_name, service_slugs')
      .eq('is_active', true),
  ])

  const providers = providersRes.data ?? []
  const bookings = openBookingsRes.data ?? []
  const activeProviders = activeProvidersRes.data ?? []

  return (
    <section className="container section">
      <h1>Admin</h1>

      <div className="section">
        <h2>Providers</h2>
        <div className="card">
          {providers.length === 0 && <p className="muted" style={{ margin: 0 }}>No providers yet.</p>}
          {providers.map((p) => (
            <AdminProviderRow key={p.id} provider={p} />
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Upcoming bookings</h2>
        <p className="muted" style={{ marginTop: -8 }}>
          Requested bookings with no provider need a manual assign, or cancel if stuck.
        </p>
        <div className="card">
          {bookings.length === 0 && <p className="muted" style={{ margin: 0 }}>No upcoming bookings.</p>}
          {bookings.map((b) => {
            const service = (b.services ?? null) as { name: string; slug: string } | null
            const matching = activeProviders.filter((p) => p.service_slugs.includes(service?.slug ?? ''))
            return (
              <AdminBookingRow
                key={b.id}
                bookingId={b.id}
                label={`${service?.name ?? 'Service'} · ${formatDateTime(b.scheduled_start)} · ${formatMinutes(b.duration_minutes)}${b.city ? ` · ${b.city}` : ''}`}
                status={b.status}
                matchingProviders={matching}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
