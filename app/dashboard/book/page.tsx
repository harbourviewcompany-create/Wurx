import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BookingForm } from '@/components/BookingForm'

export const dynamic = 'force-dynamic'

export default async function BookPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/book')

  const [servicesRes, balanceRes, profileRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, slug, name, icon, default_duration_minutes, credit_multiplier')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('available_balances')
      .select('available_minutes')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('address_line1, city, postal_code')
      .eq('id', user.id)
      .single(),
  ])

  const availableMinutes = balanceRes.data?.available_minutes ?? 0

  // request_booking() only checks available minutes, not subscription
  // status — this gate matches that, so minutes from any source (an
  // active plan, an admin grant, a refund) are actually spendable.
  if (availableMinutes <= 0) {
    return (
      <section className="container section">
        <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
          <h2 style={{ marginTop: 0 }}>You don&apos;t have any minutes yet</h2>
          <p className="muted">Choose a plan to get minutes you can spend on bookings.</p>
          <Link href="/pricing" className="btn btn-primary">
            See plans
          </Link>
        </div>
      </section>
    )
  }

  const services = (servicesRes.data ?? []).map((s) => ({
    ...s,
    credit_multiplier: Number(s.credit_multiplier),
  }))

  return (
    <section className="container section">
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1>Book a service</h1>
        <p className="muted">
          You have <strong>{availableMinutes} minutes</strong> available.
        </p>
        <BookingForm
          services={services}
          availableMinutes={availableMinutes}
          defaults={{
            address_line1: profileRes.data?.address_line1 ?? '',
            city: profileRes.data?.city ?? '',
            postal_code: profileRes.data?.postal_code ?? '',
          }}
        />
      </div>
    </section>
  )
}
