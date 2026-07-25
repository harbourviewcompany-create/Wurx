import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServiceBrowser } from '@/components/ServiceBrowser'
import { formatMinutes } from '@/lib/format'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

export default async function BookPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/book')

  const [servicesRes, subRes, balanceRes, profileRes] = await Promise.all([
    supabase
      .from('services')
      .select(
        'id, slug, name, description, icon, default_duration_minutes, credit_multiplier, requires_licensed_provider',
      )
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  const canBook = !!subRes.data && ACTIVE_SUB_STATUSES.includes(subRes.data.status)
  const available = balanceRes.data?.available_minutes ?? 0

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
        />
      </div>
    </section>
  )
}
