// Stripe Billing Portal session (verify_jwt = true).
//
// Customers previously had no way to cancel or change their plan in-app —
// `cancel_at_period_end` was only ever displayed. This returns a portal URL
// where they can manage payment method, switch plan, or cancel.
//
// The Stripe key lives in Supabase Vault, read via the service-role-only
// public.get_app_secret RPC, so no secret is stored in this repo.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    console.error('Vault read failed:', error.message)
    return null
  }
  return (data as string) ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Identify the caller from their JWT rather than trusting the body.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const userId = userData.user.id

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return json({ error: 'No billing account yet — subscribe to a plan first.' }, 400)
    }

    const stripeKey = await getStripeKey()
    if (!stripeKey) return json({ error: 'Billing is not configured' }, 500)
    const stripe = new Stripe(stripeKey)

    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/dashboard`,
      // This Stripe account is shared with another product (Harbourview).
      // The account-wide default portal configuration is generic/unbranded;
      // this pins the Wurx-specific one (correct headline, privacy/terms
      // links) instead of depending on which config happens to be marked
      // default account-wide.
      configuration: 'bpc_1TxZjSHGqu2rN3IeTzK2c2x5',
    })

    return json({ url: session.url })
  } catch (error) {
    console.error('billing-portal error:', error)
    return json({ error: (error as Error).message }, 400)
  }
})
