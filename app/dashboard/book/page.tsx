import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServiceBrowser } from '@/components/ServiceBrowser'
import { formatMinutes } from '@/lib/format'
import { dedupeRecentProviders } from '@/lib/booking'

export const dynamic = 'force-dynamic'

/** Rough “standard clean” cost for plain-language balance (~3h visit × 1.0). */
const STANDARD_CLEAN_MINUTES = 180

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

  const [servicesRes, balanceRes, profileRes, pastProvidersRes] = await Promise.all([
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
    // Pros this customer has actually had on site. request_booking enforces the
    // same rule server-side, so this is the presentation half of one constraint.
    supabase
      .from('bookings')
      // providers!provider_id disambiguates: bookings has two FKs to providers
      // (provider_id and the new preferred_provider_id).
      .select('provider_id, providers!provider_id(id, business_name, rating, service_slugs)')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('provider_id', 'is', null)
      .order('scheduled_start', { ascending: false })
      .limit(50),
  ])

  const available = balanceRes.data?.available_minutes ?? 0
  const canBook = available > 0
  const approxCleans = Math.max(0, Math.floor(available / STANDARD_CLEAN_MINUTES))

  const services = (servicesRes.data ?? []).map((s) => ({
    ...s,
    credit_multiplier: Number(s.credit_multiplier),
  }))

  const pastProviders = dedupeRecentProviders(
    (pastProvidersRes.data ?? []).map((row) => {
      const p = row.providers as {
        id: string
        business_name: string | null
        rating: number | null
        service_slugs: string[] | null
      } | null
      if (!p) return null
      return {
        id: p.id,
        business_name: p.business_name ?? 'Your pro',
        rating: p.rating,
        service_slugs: p.service_slugs ?? [],
      }
    }),
  )

  return (
    <section className="container section">
      <div className="browse-head">
        <div>
          <h1 style={{ margin: 0 }}>What do you need done?</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 420 }}>
            {canBook ? (
              <>
                You have{' '}
                <strong style={{ color: 'var(--text)' }}>{formatMinutes(available)}</strong> in
                your plan
                {approxCleans > 0 ? (
                  <>
                    {' '}
                    — enough for about{' '}
                    <strong style={{ color: 'var(--text)' }}>
                      {approxCleans} standard clean{approxCleans === 1 ? '' : 's'}
                    </strong>
                  </>
                ) : null}
                . Tap a service to book in under a minute.
              </>
            ) : (
              'Browse what we cover — pick a plan when you’re ready to book.'
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
          pastProviders={pastProviders}
        />
      </div>
    </section>
  )
}
