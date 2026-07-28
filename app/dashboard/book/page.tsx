import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServiceBrowser } from '@/components/ServiceBrowser'
import { formatMinutes } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; duration?: string }>
}) {
  const { service: serviceSlug, duration: durationRaw } = await searchParams
  const initialDuration = durationRaw ? Number(durationRaw) : undefined
  const durationOk =
    initialDuration != null && Number.isFinite(initialDuration) && initialDuration >= 30
      ? Math.min(600, Math.round(initialDuration))
      : undefined

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/book')

  const [servicesRes, balanceRes, profileRes] = await Promise.all([
    supabase
      .from('services')
      .select(
        'id, slug, name, description, icon, default_duration_minutes, credit_multiplier, requires_licensed_provider',
      )
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

  const available = balanceRes.data?.available_minutes ?? 0
  // request_booking() only ever checks available minutes server-side, not
  // subscription status — this matches that, so minutes from any source
  // (an active plan, an admin grant, a refund) are actually spendable
  // instead of being hidden behind a subscription row that may not exist.
  const canBook = available > 0

  const services = (servicesRes.data ?? []).map((s) => ({
    ...s,
    credit_multiplier: Number(s.credit_multiplier),
  }))

  return (
    <section className="container section">
      <div className="browse-head">
        <div>
          <h1 style={{ margin: 0 }}>Book a service</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {canBook ? (
              <>
                <strong style={{ color: 'var(--text)' }}>
                  {formatMinutes(available)}
                </strong>{' '}
                of service time available
              </>
            ) : (
              'Browse everything we do — start a plan when you’re ready.'
            )}
          </p>
        </div>
        {!canBook && (
          <Link href="/pricing" className="btn btn-primary">
            Choose a plan
          </Link>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <ServiceBrowser
          services={services}
          availableMinutes={available}
          canBook={canBook}
          defaults={{
            address_line1: profileRes.data?.address_line1 ?? '',
            city: profileRes.data?.city ?? '',
            postal_code: profileRes.data?.postal_code ?? '',
          }}
          initialServiceSlug={serviceSlug ?? null}
          initialDurationMinutes={durationOk}
        />
      </div>
    </section>
  )
}
