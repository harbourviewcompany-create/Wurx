import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatEffectiveRate, formatMinutes, formatPrice } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'

// Must be dynamic: signed-in users should never see the marketing shell.
export const dynamic = 'force-dynamic'

const STEPS = [
  {
    title: 'Pick a plan',
    body: 'Choose a monthly membership sized to how often you need help — not a pile of one-off quotes.',
  },
  {
    title: 'Book a service',
    body: 'Cleaning, snow removal, lawn care, handyman help and more — schedule it in a couple of taps.',
  },
  {
    title: 'A pro shows up',
    body: 'A vetted local pro handles the job. We only use the minutes you actually need.',
  },
]

/** Outcome-first examples (F2) — lead with jobs, not ledger units. */
const PLAN_EXAMPLES: Record<string, string> = {
  starter: 'About 1 deep clean or a few snow clears a month',
  home: 'About 2–3 cleans a month, or clean + lawn in season',
  plus: 'Weekly clean + outdoor care + handyman buffer',
}

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders with proxy redirect: signed-in → book catalogue.
  if (user) {
    redirect('/dashboard/book')
  }

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

  const planList = plans ?? []
  const featuredIndex =
    planList.findIndex((p) => p.slug === 'home') >= 0
      ? planList.findIndex((p) => p.slug === 'home')
      : Math.floor(planList.length / 2)

  return (
    <>
      <section className="container hero rise">
        <span className="eyebrow">
          <Sparkles size={14} /> Now serving Ottawa
        </span>
        <h1>
          Your home, handled —{' '}
          <span className="gradient-text">on a subscription.</span>
        </h1>
        <p>
          One monthly plan covers the jobs you actually need — cleans, snow, lawn,
          handyman help. Book in minutes. Vetted local pros show up. Cancel anytime.
        </p>
        <div className="cta">
          <Link href="/pricing" className="btn btn-primary btn-lg">
            Choose a plan
          </Link>
          <Link href="#how-it-works" className="btn btn-lg">
            See how it works
          </Link>
        </div>
        <div className="trust-row" style={{ marginTop: 22 }}>
          <span>
            <ShieldCheck size={16} /> Vetted & insured pros
          </span>
          <span>
            <Check size={16} /> No contracts
          </span>
          <span>
            <Check size={16} /> Cancel anytime
          </span>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <span className="eyebrow">Services</span>
          <h2>What we take off your plate</h2>
          <p className="muted">
            Book what you need when you need it — each job uses time from your plan
            at a rate that fits the work.
          </p>
        </div>
        <div className="grid grid-3">
          {(services ?? []).map((s) => (
            <div key={s.slug} className="card card-hover">
              <span className="icon-chip">
                <ServiceIcon name={s.icon} />
              </span>
              <h3 style={{ marginTop: 14 }}>{s.name}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                {s.description ?? 'Booked with your plan.'}
              </p>
            </div>
          ))}
          {(!services || services.length === 0) && (
            <p className="muted">Services are being set up. Check back soon.</p>
          )}
        </div>
      </section>

      <section id="how-it-works" className="container section">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Three steps to a handled home</h2>
        </div>
        <div className="grid grid-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="card">
              <span className="step-num">{i + 1}</span>
              <h3>{step.title}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="plans" className="container section">
        <div className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>Simple monthly plans</h2>
          <p className="muted">
            Pick the plan that matches how often you need help. Minutes are how we
            meter the work — you book real jobs.
          </p>
        </div>
        <div className="plans">
          {planList.map((p, i) => {
            const featured = i === featuredIndex
            const rate = formatEffectiveRate(p.price_cents, p.monthly_minutes)
            const example = PLAN_EXAMPLES[p.slug]
            return (
              <div
                key={p.slug}
                className={`card plan${featured ? ' featured' : ''}`}
              >
                {featured && <span className="ribbon">Most popular</span>}
                <h3>{p.name}</h3>
                <div className="price">
                  <b>{formatPrice(p.price_cents)}</b>
                  <small>/ month</small>
                </div>
                {example && (
                  <p style={{ margin: '8px 0 0', fontWeight: 600, fontSize: 15 }}>
                    {example}
                  </p>
                )}
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  Includes {formatMinutes(p.monthly_minutes)} of service time
                  {rate ? ` · ${rate}` : ''}
                </p>
                <div className="plan-cta" style={{ marginTop: 'auto' }}>
                  <Link
                    href={`/pricing?plan=${p.slug}`}
                    className={`btn btn-lg${featured ? ' btn-primary' : ''}`}
                    style={{ width: '100%' }}
                  >
                    Choose {p.name}
                  </Link>
                  <p
                    className="muted"
                    style={{ margin: '10px 0 0', fontSize: 12, textAlign: 'center' }}
                  >
                    Account + secure checkout — cancel anytime.
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="container section">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Are you a pro?</h2>
          <p className="muted">
            Offer cleaning, snow removal, lawn care, handyman work or more?
            Set up your profile and start claiming jobs in Ottawa — no
            recruiter, no waiting.
          </p>
          <Link href="/become-a-pro" className="btn btn-primary">
            Become a Wurx pro
          </Link>
        </div>
      </section>
    </>
  )
}
