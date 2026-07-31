// Stripe checkout (verify_jwt = true).
//
// The caller is derived exclusively from the verified Supabase JWT. Client
// input may select an active Stripe price, but can never choose the user whose
// profile, Stripe customer, subscription, or minute grant will be affected.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ACTIVE_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due'] as const
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getStripeKey(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_app_secret', {
    p_name: 'STRIPE_SECRET_KEY',
  })
  if (error) {
    console.error('Failed to read Stripe key from Vault:', error.message)
    return null
  }
  return (data as string) ?? null
}

async function ensureStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error('Could not load your billing profile.')
  }
  if (profile.stripe_customer_id) return profile.stripe_customer_id

  // Stripe idempotency prevents concurrent requests from creating multiple
  // customers for the same Supabase user. The conditional database update then
  // makes the local claim atomic if two function invocations overlap.
  const customer = await stripe.customers.create(
    {
      email: profile.email ?? email,
      metadata: { supabase_user_id: userId },
    },
    { idempotencyKey: `wurx-customer-${userId}` },
  )

  const { data: claimed, error: claimError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
    .is('stripe_customer_id', null)
    .select('stripe_customer_id')
    .maybeSingle()

  if (claimError) {
    console.error(`Failed to persist Stripe customer ${customer.id}:`, claimError.message)
    throw new Error('Could not save your billing account. Please try again.')
  }
  if (claimed?.stripe_customer_id) return claimed.stripe_customer_id

  const { data: winner, error: winnerError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (winnerError || !winner?.stripe_customer_id) {
    throw new Error('Could not save your billing account. Please try again.')
  }
  return winner.stripe_customer_id
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const userId = userData.user.id
    const body = await req.json().catch(() => ({}))
    const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : ''
    if (!priceId) return json({ error: 'priceId is required' }, 400)

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', [...ACTIVE_SUBSCRIPTION_STATUSES])
      .limit(1)
      .maybeSingle()

    if (subscriptionError) {
      console.error('Active subscription lookup failed:', subscriptionError.message)
      return json({ error: 'Could not verify subscription status' }, 500)
    }
    if (existingSubscription) {
      return json(
        {
          error:
            'You already have an active subscription. Manage the existing plan from your dashboard.',
        },
        409,
      )
    }

    // Resolve the commercial entitlement server-side. The client never sends a
    // price amount, minute amount, plan id, customer id, or user id.
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, monthly_minutes, stripe_price_id')
      .eq('stripe_price_id', priceId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) return json({ error: 'Unknown or inactive price' }, 400)

    const stripeKey = await getStripeKey()
    if (!stripeKey) return json({ error: 'Stripe key not configured' }, 500)
    const stripe = new Stripe(stripeKey)
    const customerId = await ensureStripeCustomer(
      stripe,
      userId,
      userData.user.email,
    )

    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'
    const windowId = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS)
    const idempotencyKey = `wurx-checkout-${userId}-${priceId}-${windowId}`

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: userId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${siteUrl}/dashboard?success=true`,
        cancel_url: `${siteUrl}/pricing`,
        metadata: {
          userId,
          plan_id: plan.id,
          monthly_minutes: String(plan.monthly_minutes),
        },
        subscription_data: {
          metadata: {
            userId,
            plan_id: plan.id,
            stripe_price_id: priceId,
          },
        },
      },
      { idempotencyKey },
    )

    return json({ url: session.url })
  } catch (error) {
    console.error('create-checkout error:', error)
    const message =
      error instanceof Stripe.errors.StripeError
        ? 'Secure checkout could not be started. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Secure checkout could not be started.'
    return json({ error: message }, 400)
  }
})
