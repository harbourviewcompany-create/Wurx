import Link from 'next/link'
import { ArrowRight, Clock3, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMinutes } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'

export const revalidate = 300

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: services } = await supabase
    .from('services')
    .select(
      'slug, name, description, icon, default_duration_minutes, credit_multiplier, requires_licensed_provider',
    )
    .eq('is_active', true)
    .order('sort_order')

  return (
    <section className="container section">
      <header className="hero pricing-intro" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Home services</span>
        <h1>One place for the work your home needs.</h1>
        <p>
          Browse the available services, typical visit length, and expected plan-time use. Wurx calculates the exact amount before every booking.
        </p>
      </header>

      <div className="grid grid-2 public-services-grid">
        {(services ?? []).map((service) => {
          const cost = Math.ceil(service.default_duration_minutes * Number(service.credit_multiplier))
          return (
            <article key={service.slug} className="card">
              <span className="icon-chip" aria-hidden="true">
                <ServiceIcon name={service.icon} />
              </span>
              <div className="service-public-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 23 }}>{service.name}</h2>
                  {service.requires_licensed_provider && (
                    <span className="tag warn">
                      <ShieldCheck size={13} aria-hidden="true" /> Licensed
                    </span>
                  )}
                </div>
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  {service.description ?? 'A vetted local professional handles this service for you.'}
                </p>
                <div className="service-public-meta">
                  <span>
                    <Clock3 size={15} aria-hidden="true" /> Typical visit: {formatMinutes(service.default_duration_minutes)}
                  </span>
                  <span>About {formatMinutes(cost)} of plan time</span>
                </div>
              </div>
              <div className="service-public-action">
                <Link href={`/dashboard/book?service=${encodeURIComponent(service.slug)}`} className="btn">
                  Book {service.name} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </article>
          )
        })}
      </div>

      {(services ?? []).length === 0 && (
        <div className="card empty-state">
          <h2 style={{ marginTop: 0 }}>Services are being prepared</h2>
          <p className="muted">The local catalogue is temporarily unavailable. Check again shortly.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 22, textAlign: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 25 }}>Ready to get something handled?</h2>
        <p className="muted">Choose a service and Wurx will guide you through the booking one decision at a time.</p>
        <Link href="/dashboard/book" className="btn btn-primary">
          Book a service
        </Link>
      </div>
    </section>
  )
}
