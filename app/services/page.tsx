import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMinutes } from '@/lib/format'

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
      <div className="hero" style={{ paddingBottom: 8 }}>
        <h1>Services</h1>
        <p>
          Everything below is booked with the minutes in your plan. Minutes are
          charged by the service&apos;s rate — shown per booking before you
          confirm.
        </p>
      </div>

      <div className="grid grid-2">
        {(services ?? []).map((s) => {
          const cost = Math.ceil(
            s.default_duration_minutes * Number(s.credit_multiplier),
          )
          return (
            <div key={s.slug} className="card">
              <div className="list-row" style={{ paddingTop: 0 }}>
                <h3 style={{ margin: 0 }}>
                  {s.icon ? `${s.icon} ` : ''}
                  {s.name}
                </h3>
                {s.requires_licensed_provider && (
                  <span className="tag warn">Licensed pro</span>
                )}
              </div>
              <p className="muted">{s.description ?? ''}</p>
              <p className="muted">
                Typical visit: {formatMinutes(s.default_duration_minutes)} ·
                costs about {formatMinutes(cost)} of plan minutes
              </p>
            </div>
          )
        })}
      </div>

      <p className="form-note">
        Ready to book?{' '}
        <Link href="/dashboard" style={{ color: 'var(--brand)' }}>
          Go to your dashboard
        </Link>
        .
      </p>
    </section>
  )
}
