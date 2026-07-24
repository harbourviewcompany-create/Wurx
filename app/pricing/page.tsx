import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMinutes, formatPrice } from '@/lib/format'
import { PlanCheckoutButton } from '@/components/PlanCheckoutButton'

export const revalidate = 60

export default async function PricingPage() {
  const supabase = await createClient()

  const [{ data: plans }, { data: userData }] = await Promise.all([
    supabase
      .from('plans')
      .select('id, slug, name, description, price_cents, monthly_minutes, stripe_price_id')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.auth.getUser(),
  ])

  const user = userData.user

  return (
    <section className="container section">
      <div className="hero" style={{ paddingBottom: 8 }}>
        <h1>Plans</h1>
        <p>
          Every plan is a monthly bank of service minutes. Different services
          spend minutes at different rates — a quick job costs less than a
          specialised one.
        </p>
      </div>

      <div className="grid grid-3">
        {(plans ?? []).map((p) => (
          <div key={p.id} className="card">
            <h3>{p.name}</h3>
            <div className="price">
              {formatPrice(p.price_cents)} <small>/ month</small>
            </div>
            <p className="muted">
              {formatMinutes(p.monthly_minutes)} of service minutes every month
            </p>
            {p.description && <p className="muted">{p.description}</p>}
            <div style={{ marginTop: 16 }}>
              <PlanCheckoutButton
                priceId={p.stripe_price_id}
                planName={p.name}
                isAuthed={!!user}
              />
            </div>
          </div>
        ))}
      </div>

      {(!plans || plans.length === 0) && (
        <p className="muted">Plans are being set up. Check back soon.</p>
      )}

      <p className="form-note">
        Questions first?{' '}
        <Link href="/services" style={{ color: 'var(--brand)' }}>
          See what&apos;s included
        </Link>
        .
      </p>
    </section>
  )
}
