// Deployed to Supabase project rzdavbuoisckvdapbcbj (verify_jwt = true).
//
// The Stripe server key is stored in Supabase Vault (not in env or in this file)
// and read at runtime via the service-role-only RPC public.get_app_secret, so no
// secret lives in this public repo. Redeploy with:
//   supabase functions deploy create-billing-portal-session
//
// Unlike create-checkout, this function derives the caller's identity from the
// verified JWT (via supabase.auth.getUser(token)) instead of trusting a
// client-supplied userId — a customer must never be able to open another
// customer's billing portal by passing an arbitrary id.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getStripeKey(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('get_app_secret', {
    p_name: 'STRIPE_SECRET_KEY',
  })
  if (error) {
    console.error('Failed to read Stripe key from Vault:', error.message)
    return null
  }
  return (data as string) ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the token and get the real caller id — never trust a client-supplied
    // userId for something that opens billing management for an account.
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No billing account yet — subscribe to a plan first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripeKey = await getStripeKey()
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const stripe = new Stripe(stripeKey)

    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/dashboard`,
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('create-billing-portal-session error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
