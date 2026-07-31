import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock3, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ServiceBrowser } from '@/components/ServiceBrowser'
import { formatMinutes } from '@/lib/format'
import { dedupeRecentProviders } from '@/lib/booking'

export const dynamic = 'force-dynamic'

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
      .select('available_minutes, held_minutes')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('address_line1, city, postal_code')
      .eq('id', user.id)
      .single(),
    supabase
      .from('bookings')
      .select('provider_id, providers!provider_id(id, business_name, rating, service_slugs)')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('provider_id', 'is', null)
      .order('scheduled_start', { ascending: false })
      .limit(50),
  ])

  const available = balanceRes.data?.available_minutes ?? 0
  const held = balanceRes.data?.held_minutes ?? 0
  const canBook = available > 0
  const approxCleans = Math.max(0, Math.floor(available / STANDARD_CLEAN_MINUTES))

  const services = (servicesRes.data ?? []).map((service) => ({
    ...service,
    credit_multiplier: Number(service.credit_multiplier),
  }))

  const pastProviders = dedupeRecentProviders(
    (pastProvidersRes.data ?? []).map((row) => {
      const provider = row.providers as {
        id: string
        business_name: string | null
        rating: number | null
        service_slugs: string[] | null
      } | null
      if (!provider) return null
      return {
        id: provider.id,
        business_name: provider.business_name ?? 'Your professional',
        rating: provider.rating,
        service_slugs: provider.service_slugs ?? [],
      }
    }),
  )

  return (
    <section className="container section">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={17} aria-hidden="true" /> Home
      </Link>

      <header className="book-page-head">
        <div>
          <p className="dashboard-kicker">Book household help</p>
          <h1>What do you need done?</h1>
          <p>
            Search or choose a service. Before you confirm, Wurx shows the visit length, arrival window, and exact plan time reserved.
          </p>
        </div>

        {canBook ? (
          <div className="plan-balance-strip" role="group" aria-label="Current plan-time balance">
            <div>
              <strong>{formatMinutes(available)}</strong>
              <span>available now</span>
            </div>
            <div>
              <strong>{formatMinutes(held)}</strong>
              <span>already reserved</span>
            </div>
            <div>
              <strong>{approxCleans > 0 ? `About ${approxCleans}` : 'Under 1'}</strong>
              <span>standard cleans</span>
            </div>
          </div>
        ) : (
          <Link href="/pricing" className="btn btn-primary">
            Choose a plan
          </Link>
        )}
      </header>

      <div className="card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <WalletCards size={20} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong>Your plan pays with service time</strong>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 14 }}>
              Most services use roughly one plan hour per hour of work. Specialized services can use a different rate; Wurx always calculates it before booking.
            </p>
          </div>
          <Clock3 size={20} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0 }} />
        </div>
      </div>

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
    </section>
  )
}
