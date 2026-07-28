import Link from 'next/link'
import { Check, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatEffectiveRate, formatMinutes, formatPrice } from '@/lib/format'
import { PlanCheckoutButton } from '@/components/PlanCheckoutButton'
import { AutoStartCheckout } from '@/components/AutoStartCheckout'

export const dynamic = 'force-dynamic'

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    'Book any service in your area',
    'Vetted, insured local pros',
    'Cancel anytime',
  ],
  home: [
    'Everything in Starter',
    'Priority scheduling',
    'Best for regular home upkeep',
  ],
  plus: [
    'Everything in Home',
    'Priority pro matching',
    'Ideal for larger homes',
  ],
}
const DEFAULT_FEATURES = [
  'Book any service in your area',
  'Vetted, insured local pros',
  'Cancel anytime',
]

const PLAN_EXAMPLES: Record<string, string> = {
  starter: 'About 1 deep clean or a few snow clears a month',
  home: 'About 2–3 cleans a month, or clean + lawn in season',
  plus: 'Weekly clean + outdoor care + handyman buffer',
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; priceId?: string }>
}) {
  const { plan: planQuery, priceId: priceIdQuery } = await searchParams
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
  const list = plans ?? []
  const featuredIndex = (() => {
    if (planQuery) {
      const i = list.findIndex((p) => p.slug === planQuery)
      if (i >= 0) return i
    }
    const home = list.findIndex((p) => p.slug === 'home')
    if (home >= 0) return home
    return Math.floor(list.length / 2)
  })()

  return (
    <section className="container section center">
      <div className="hero rise" style={{ paddingBottom: 8 }}>
        <span className="eyebrow">Membership plans</span>
        <h1>
          One plan. <span className="gradient-text">Your whole home.</span>
        </h1>
        <p>
          Choose how much help you need each month — cleans, snow, lawn, handyman.
          Book real jobs; we meter them in service time so every visit is fair.
        </p>
      </div>

      <AutoStartCheckout priceId={priceIdQuery ?? null} isAuthed={!!user} />

      <div className="plans">
        {list.map((p, i) => {
          const featured = i === featuredIndex
          const features = PLAN_FEATURES[p.slug] ?? DEFAULT_FEATURES
          const rate = formatEffectiveRate(p.price_cents, p.monthly_minutes)
          const example = PLAN_EXAMPLES[p.slug]
          return (
            <div
              key={p.id}
              id={`plan-${p.slug}`}
              className={`card plan${featured ? ' featured' : ''}`}
              style={{ textAlign: 'left' }}
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
                {p.description ??
                  `Includes ${formatMinutes(p.monthly_minutes)} of service time`}
                {rate ? ` · ${rate}` : ''}
              </p>
              <ul className="features">
                <li>
                  <strong style={{ color: 'var(--text)' }}>
                    {formatMinutes(p.monthly_minutes)}
                  </strong>{' '}
                  of service time every month
                </li>
                {features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="plan-cta">
                <PlanCheckoutButton
                  priceId={p.stripe_price_id}
                  planName={p.name}
                  planSlug={p.slug}
                  isAuthed={!!user}
                  variant={featured ? 'primary' : 'default'}
                />
              </div>
            </div>
          )
        })}
      </div>

      {list.length === 0 && (
        <p className="muted">Plans are being set up. Check back soon.</p>
      )}

      <div className="trust-row" style={{ marginTop: 30 }}>
        <span>
          <ShieldCheck size={16} /> Vetted & insured pros
        </span>
        <span>
          <Check size={16} /> No contracts, cancel anytime
        </span>
        <span>
          <Check size={16} /> Unused minutes never wasted
        </span>
      </div>

      <p className="form-note">
        Not sure yet?{' '}
        <Link href="/services" style={{ color: 'var(--brand)' }}>
          See everything that&apos;s included
        </Link>
      </p>
    </section>
  )
}
