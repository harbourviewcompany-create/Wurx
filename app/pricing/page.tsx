import Link from 'next/link'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatEffectiveRate, formatMinutes, formatPrice } from '@/lib/format'
import { PlanCheckoutButton } from '@/components/PlanCheckoutButton'
import { AutoStartCheckout } from '@/components/AutoStartCheckout'
import { ManageSubscriptionButton } from '@/components/ManageSubscriptionButton'

export const dynamic = 'force-dynamic'

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    'Book any available service in your area',
    'Vetted local professionals',
    'See exact plan-time use before booking',
  ],
  home: [
    'Everything in Starter',
    'Priority scheduling',
    'Designed for regular home upkeep',
  ],
  plus: [
    'Everything in Home',
    'Priority professional matching',
    'More flexibility for larger households',
  ],
}

const DEFAULT_FEATURES = [
  'Book any available service in your area',
  'Vetted local professionals',
  'See exact plan-time use before booking',
]

const PLAN_EXAMPLES: Record<string, string> = {
  starter: 'About one deep clean or several shorter seasonal jobs',
  home: 'About two standard cleans, or cleaning plus seasonal care',
  plus: 'Regular cleaning with room for outdoor work and repairs',
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
  const { data: currentSubscription } = user
    ? await supabase
        .from('subscriptions')
        .select('status, plans(slug, name)')
        .eq('user_id', user.id)
        .in('status', ACTIVE_SUB_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const currentPlan = (currentSubscription?.plans ?? null) as { slug: string; name: string } | null
  const list = plans ?? []
  const featuredIndex = (() => {
    if (planQuery) {
      const index = list.findIndex((plan) => plan.slug === planQuery)
      if (index >= 0) return index
    }
    const home = list.findIndex((plan) => plan.slug === 'home')
    if (home >= 0) return home
    return Math.floor(list.length / 2)
  })()

  return (
    <section className="container section center">
      <header className="hero pricing-intro rise" style={{ paddingBottom: 14 }}>
        <span className="eyebrow">Membership plans</span>
        <h1>
          One plan. <span className="gradient-text">A simpler home.</span>
        </h1>
        <p>
          Choose how much household help you want each billing period. Use that service time across cleaning, seasonal work, handyman visits, and other locally available services.
        </p>
        <div className="plan-proof-row" aria-label="Membership benefits">
          <span>
            <ShieldCheck size={17} aria-hidden="true" /> Vetted local professionals
          </span>
          <span>
            <Check size={17} aria-hidden="true" /> Exact time shown before booking
          </span>
          <span>
            <Check size={17} aria-hidden="true" /> Manage your plan online
          </span>
        </div>
      </header>

      <AutoStartCheckout
        priceId={currentPlan ? null : (priceIdQuery ?? null)}
        isAuthed={!!user}
      />

      {currentPlan && (
        <div className="card" role="status" style={{ maxWidth: 720, margin: '0 auto 22px', textAlign: 'left' }}>
          <div className="card-heading">
            <Sparkles size={19} aria-hidden="true" />
            <strong>Your {currentPlan.name} membership is active</strong>
          </div>
          <p className="muted" style={{ margin: '7px 0 12px' }}>
            Compare the other plans below or manage billing and cancellation from your account.
          </p>
          <ManageSubscriptionButton />
        </div>
      )}

      <div className="plans">
        {list.map((plan, index) => {
          const featured = index === featuredIndex
          const isCurrent = currentPlan?.slug === plan.slug
          const features = PLAN_FEATURES[plan.slug] ?? DEFAULT_FEATURES
          const rate = formatEffectiveRate(plan.price_cents, plan.monthly_minutes)
          const example = PLAN_EXAMPLES[plan.slug]

          return (
            <article
              key={plan.id}
              id={`plan-${plan.slug}`}
              className={`card plan${featured ? ' featured' : ''}`}
              style={{ textAlign: 'left' }}
              aria-label={`${plan.name} membership${isCurrent ? ', current plan' : ''}`}
            >
              {featured && !isCurrent && <span className="ribbon">Most popular</span>}
              {isCurrent && <span className="ribbon">Current plan</span>}
              <h2 style={{ margin: 0, fontSize: 25 }}>{plan.name}</h2>
              <div className="price">
                <b>{formatPrice(plan.price_cents)}</b>
                <small>/ month</small>
              </div>
              <p style={{ margin: '10px 0 0', fontWeight: 800, fontSize: 16 }}>
                {example ?? `${formatMinutes(plan.monthly_minutes)} of household help`}
              </p>
              <p className="muted" style={{ margin: '7px 0 0', fontSize: 14 }}>
                {formatMinutes(plan.monthly_minutes)} of service time each billing period
                {rate ? ` · ${rate}` : ''}
              </p>
              {plan.description && (
                <p className="muted" style={{ margin: '7px 0 0', fontSize: 14 }}>
                  {plan.description}
                </p>
              )}
              <ul className="features">
                {features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="plan-cta">
                {isCurrent ? (
                  <button type="button" className="btn btn-lg" disabled style={{ width: '100%' }}>
                    Current plan
                  </button>
                ) : (
                  <PlanCheckoutButton
                    priceId={plan.stripe_price_id}
                    planName={plan.name}
                    planSlug={plan.slug}
                    isAuthed={!!user}
                    variant={featured ? 'primary' : 'default'}
                  />
                )}
              </div>
            </article>
          )
        })}
      </div>

      {list.length === 0 && (
        <div className="card empty-state" style={{ maxWidth: 640, marginInline: 'auto', textAlign: 'left' }}>
          <h2 style={{ marginTop: 0 }}>Plans are being prepared</h2>
          <p className="muted">Membership options are temporarily unavailable. Check again shortly.</p>
        </div>
      )}

      <p className="form-note">
        Need to see what you can book?{' '}
        <Link href="/services" style={{ color: 'var(--brand)', fontWeight: 700 }}>
          Browse every service
        </Link>
      </p>
    </section>
  )
}
