import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatMinutes } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'
import { setBookingStatus, assignProvider } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
}

const STATUSES = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled']

export default async function AdminBookingsPage() {
  const supabase = await createClient()

  const [bookingsRes, providersRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, user_id, status, scheduled_start, duration_minutes, provider_id, services(name, icon)')
      .order('scheduled_start', { ascending: false })
      .limit(100),
    supabase.from('dispatchable_providers').select('id, business_name'),
  ])

  const bookings = bookingsRes.data ?? []
  const providers = providersRes.data ?? []

  const customerIds = [...new Set(bookings.map((b) => b.user_id))]
  const { data: customerRows } = customerIds.length
    ? await supabase.from('profiles').select('id, email, full_name').in('id', customerIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] }
  const customerById = new Map((customerRows ?? []).map((c) => [c.id, c]))

  // Only bookings that are still assignable get a filtered eligible-provider
  // list — completed/cancelled ones don't need it, and computing it for all
  // 100 rows would mean bookings x providers RPC calls for no reason.
  const assignableBookings = bookings.filter((b) => b.status === 'requested' || b.status === 'confirmed')
  const eligibleByBooking = new Map<string, Set<string>>()
  await Promise.all(
    assignableBookings.map(async (b) => {
      const results = await Promise.all(
        providers.map(async (p) => {
          if (!p.id) return null
          const { data } = await supabase.rpc('provider_can_serve_booking', {
            p_provider_id: p.id,
            p_booking_id: b.id,
          })
          return data ? p.id : null
        }),
      )
      eligibleByBooking.set(b.id, new Set(results.filter((id): id is string => !!id)))
    }),
  )

  return (
    <div className="card" style={{ marginTop: 18 }}>
      {bookings.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No bookings yet.
        </p>
      )}
      {bookings.map((b) => {
        const service = (b.services ?? null) as { name: string; icon: string | null } | null
        const customer = customerById.get(b.user_id) ?? null
        const isAssignable = b.status === 'requested' || b.status === 'confirmed'
        return (
          <div key={b.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 220 }}>
              <strong className="card-heading">
                <ServiceIcon name={service?.icon} size={16} />
                {service?.name ?? 'Service'}
              </strong>
              <div className="muted" style={{ fontSize: 14 }}>
                {customer?.full_name ?? customer?.email ?? 'Unknown customer'}
              </div>
              <div className="muted" style={{ fontSize: 14 }}>
                {formatDateTime(b.scheduled_start)} · {formatMinutes(b.duration_minutes)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={STATUS_TAG[b.status] ?? 'tag'}>{b.status}</span>

              <form action={setBookingStatus} style={{ display: 'flex', gap: 6 }}>
                <input type="hidden" name="bookingId" value={b.id} />
                <select name="status" defaultValue={b.status} style={{ width: 'auto' }}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit">
                  Save
                </button>
              </form>

              {isAssignable && (
                <form action={assignProvider} style={{ display: 'flex', gap: 6 }}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <select name="providerId" defaultValue={b.provider_id ?? ''} style={{ width: 'auto' }}>
                    <option value="">Unassigned</option>
                    {providers
                      .filter((p) => p.id && eligibleByBooking.get(b.id)?.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id ?? ''}>
                          {p.business_name}
                        </option>
                      ))}
                  </select>
                  <button className="btn" type="submit">
                    Assign
                  </button>
                </form>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
