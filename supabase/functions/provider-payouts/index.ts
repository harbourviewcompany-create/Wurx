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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = body?.action ?? 'onboard'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    // ---- admin_payout: release accrued unpaid earnings to a provider ---
    // Caller must be an admin; target provider comes from the request body
    // (not derived from the caller's own provider row, since the caller
    // here is the admin, not the provider being paid). Handled before the
    // "caller must be a registered provider" gate below, since an admin
    // releasing payouts has no reason to be a provider themselves.
    if (action === 'admin_payout') {
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      if (callerProfile?.role !== 'admin') return json({ error: 'Not authorized' }, 403)

      const targetProviderId = body?.providerId
      if (!targetProviderId) return json({ error: 'providerId is required' }, 400)

      const { data: targetProvider } = await supabase
        .from('providers')
        .select('id, stripe_account_id, payouts_enabled')
        .eq('id', targetProviderId)
        .single()
      if (!targetProvider) return json({ error: 'Provider not found' }, 404)
      if (!targetProvider.stripe_account_id || !targetProvider.payouts_enabled) {
        return json({ error: 'Provider has not completed payout onboarding' }, 400)
      }

      const { data: unpaidRows, error: unpaidErr } = await supabase
        .from('provider_earnings')
        .select('id, net_cents')
        .eq('provider_id', targetProviderId)
        .is('payout_id', null)
      if (unpaidErr) return json({ error: unpaidErr.message }, 500)

      const amountCents = (unpaidRows ?? []).reduce((sum, r) => sum + r.net_cents, 0)
      if (amountCents <= 0) return json({ error: 'Nothing owed to this provider' }, 400)

      const stripeKey = await getStripeKey()
      if (!stripeKey) return json({ error: 'Payouts are not configured' }, 500)
      const stripe = new Stripe(stripeKey)

      // Money moves first. Only once Stripe confirms the transfer do we
      // touch the database — marking earnings paid before the transfer
      // actually succeeded would be the wrong failure mode to risk.
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'cad',
        destination: targetProvider.stripe_account_id,
        metadata: { wurx_provider_id: targetProviderId },
      })

      const { data: payout, error: payoutErr } = await supabase
        .from('provider_payouts')
        .insert({
          provider_id: targetProviderId,
          amount_cents: amountCents,
          stripe_transfer_id: transfer.id,
          released_by: userId,
        })
        .select('id')
        .single()

      if (payoutErr || !payout) {
        // The transfer already went through on Stripe's side at this point.
        // Logging loudly rather than silently losing the reconciliation
        // trail - this needs a human to match transfer.id back to the
        // provider by hand if it happens.
        console.error(
          `Transfer ${transfer.id} succeeded for provider ${targetProviderId} but recording it failed:`,
          payoutErr?.message,
        )
        return json(
          { error: 'Transfer succeeded but recording it failed - contact support with transfer ' + transfer.id },
          500,
        )
      }

      await supabase
        .from('provider_earnings')
        .update({ payout_id: payout.id })
        .eq('provider_id', targetProviderId)
        .is('payout_id', null)

      return json({ paid: true, amountCents, transferId: transfer.id })
    }

    // Every other action (onboard / status) is the provider managing their
    // own payouts, so it's gated on the caller actually being one.
    const { data: provider } = await supabase
      .from('providers')
      .select('id, business_name, stripe_account_id, payouts_enabled, verification')
      .eq('user_id', userId)
      .maybeSingle()

    if (!provider) return json({ error: 'You are not a registered provider' }, 403)

    const stripeKey = await getStripeKey()
    if (!stripeKey) return json({ error: 'Payouts are not configured' }, 500)
    const stripe = new Stripe(stripeKey)

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
    // Stripe errors here are almost always platform-side (Connect not
    // enabled yet, a key missing a permission, etc.) -- nothing the
    // provider can act on. Show them something calm instead of Stripe's
    // internal wording; the real detail is in the log line above.
    const message =
      error instanceof Stripe.errors.StripeError
        ? "Payouts aren't available yet -- we're finishing setup on our end. Check back soon."
        : (error as Error).message
    return json({ error: message }, 400)
  }
})
