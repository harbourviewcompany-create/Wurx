import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMinutes, formatPrice } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'

export const revalidate = 300

export default async function Home() {
  const supabase = await createClient()

  const [{ data: services }, { data: plans }] = await Promise.all([
    supabase
      .from('services')
      .select('slug, name, description, icon')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('plans')
      .select('slug, name, price_cents, monthly_minutes')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  return (
    <>
      <section className="container hero">
        <h1>Your home, handled — on a subscription.</h1>
        <p>
          One monthly plan, a bank of service minutes, and vetted local pros in
          Ottawa. Book cleaning, snow removal, lawn care, handyman help and more
          — and only spend the minutes you use.
        </p>
        <div className="cta">
          <Link href="/signup" className="btn btn-primary">
            Get started
          </Link>
          <Link href="/pricing" className="btn">
            See plans
          </Link>
        </div>
      </section>

      <section className="container section">
        <h2>What we do</h2>
        <div className="grid grid-3">
          {(services ?? []).map((s) => (
            <div key={s.slug} className="card">
              <h3 className="card-heading">
                <ServiceIcon name={s.icon} />
                {s.name}
              </h3>
              <p className="muted">{s.description ?? 'Booked with your plan minutes.'}</p>
            </div>
          ))}
          {(!services || services.length === 0) && (
            <p className="muted">Services are being set up. Check back soon.</p>
          )}
        </div>
      </section>

      <section className="container section">
        <h2>Simple plans</h2>
        <div className="grid grid-3">
          {(plans ?? []).map((p) => (
            <div key={p.slug} className="card">
              <h3>{p.name}</h3>
              <div className="price">
                {formatPrice(p.price_cents)} <small>/ month</small>
              </div>
              <p className="muted">
                {formatMinutes(p.monthly_minutes)} of service minutes each month
              </p>
              <Link
                href="/pricing"
                className="btn btn-primary"
                style={{ marginTop: 14 }}
              >
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
