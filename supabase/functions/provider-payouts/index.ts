// Stripe Connect onboarding + payout status for providers (verify_jwt = true).
//
// provider_earnings has been accruing rows with nowhere to send the money:
// there was no Connect account, no onboarding link, no transfers. This creates
// (or reuses) an Express connected account for the calling provider and returns
// an onboarding link; `action: "status"` reports whether payouts are enabled.
//
// Stripe key comes from Supabase Vault via the service-role-only
// public.get_app_secret RPC.
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
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)
    const userId = userData.user.id

    // Only a registered provider can onboard for payouts.
    const { data: provider } = await supabase
      .from('providers')
      .select('id, business_name, stripe_account_id, payouts_enabled, verification')
      .eq('user_id', userId)
      .maybeSingle()

    if (!provider) return json({ error: 'You are not a registered provider' }, 403)

    const stripeKey = await getStripeKey()
    if (!stripeKey) return json({ error: 'Payouts are not configured' }, 500)
    const stripe = new Stripe(stripeKey)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = body?.action ?? 'onboard'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    let accountId: string | null = provider.stripe_account_id

    // ---- status: refresh payouts_enabled from Stripe -----------------
    if (action === 'status') {
      if (!accountId) return json({ payouts_enabled: false, onboarded: false })
      const account = await stripe.accounts.retrieve(accountId)
      const enabled = !!account.payouts_enabled

      if (enabled !== provider.payouts_enabled) {
        // payouts_enabled is guarded against provider self-edits, so this
        // service-role write is the only path that can set it.
        await supabase
          .from('providers')
          .update({ payouts_enabled: enabled })
          .eq('id', provider.id)
      }

      return json({
        payouts_enabled: enabled,
        onboarded: !!account.details_submitted,
        requirements: account.requirements?.currently_due ?? [],
      })
    }

    // ---- onboard: create account if needed, return an onboarding link --
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: userData.user.email,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        business_profile: { name: provider.business_name },
        metadata: { wurx_provider_id: provider.id, supabase_user_id: userId },
      })
      accountId = account.id

      await supabase
        .from('providers')
        .update({ stripe_account_id: accountId })
        .eq('id', provider.id)
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/provider/dashboard?payouts=refresh`,
      return_url: `${siteUrl}/provider/dashboard?payouts=done`,
      type: 'account_onboarding',
    })

    return json({ url: link.url })
  } catch (error) {
    console.error('provider-payouts error:', error)
    return json({ error: (error as Error).message }, 400)
  }
})
