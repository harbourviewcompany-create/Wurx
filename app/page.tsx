import Link from 'next/link'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMinutes, formatPrice } from '@/lib/format'
import { ServiceIcon } from '@/components/ServiceIcon'

export const revalidate = 300

const STEPS = [
  {
    title: 'Pick a plan',
    body: 'Choose a monthly membership. It tops up your bank of service minutes every billing period.',
  },
  {
    title: 'Book a service',
    body: 'Cleaning, snow removal, lawn care, handyman help and more — schedule it in a couple of taps.',
  },
  {
    title: 'A pro shows up',
    body: 'A vetted local pro handles the job. We deduct only the minutes you actually use.',
  },
]

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
          One monthly plan, a bank of service minutes, and vetted local pros.
          Book cleaning, snow removal, lawn care, handyman help and more — and
          only spend the minutes you use.
        </p>
        <div className="cta">
          <Link href="/signup" className="btn btn-primary btn-lg">
            Get started
          </Link>
          <Link href="/pricing" className="btn btn-lg">
            See plans
          </Link>
        </div>
        <div className="trust-row" style={{ marginTop: 22 }}>
          <span>
            <ShieldCheck size={16} /> Vetted &amp; insured pros
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
            Everything is booked with the minutes in your plan — at a rate that
            fits the job.
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
                {s.description ?? 'Booked with your plan minutes.'}
              </p>
            </div>
          ))}
          {(!services || services.length === 0) && (
            <p className="muted">Services are being set up. Check back soon.</p>
          )}
        </div>
      </section>

      <section className="container section">
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

      <section className="container section">
        <div className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>Simple monthly plans</h2>
        </div>
        <div className="plans">
          {planList.map((p, i) => {
            const featured = i === featuredIndex
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
                <p className="muted" style={{ margin: '2px 0 0' }}>
                  {formatMinutes(p.monthly_minutes)} of service time each month
                </p>
                <div className="plan-cta" style={{ marginTop: 'auto' }}>
                  <Link
                    href="/pricing"
                    className={`btn btn-lg${featured ? ' btn-primary' : ''}`}
                    style={{ width: '100%' }}
                  >
                    Choose {p.name}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
