// Deployed to Supabase project rzdavbuoisckvdapbcbj (verify_jwt = true).
// This file mirrors the live function; keep them in sync — redeploy with:
//   supabase functions deploy create-checkout
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, priceId } = await req.json()

    if (!userId || !priceId) {
      return new Response(
        JSON.stringify({ error: 'userId and priceId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up the plan server-side (never trust a client-supplied minute/hour amount)
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, monthly_minutes, stripe_price_id')
      .eq('stripe_price_id', priceId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Unknown or inactive price' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('create-checkout error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
