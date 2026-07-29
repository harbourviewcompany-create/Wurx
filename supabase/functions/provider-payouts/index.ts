// Stripe Connect onboarding + payout status for providers (verify_jwt = true).
//
// Supports:
//   action: "account_session" — in-app embedded onboarding (preferred)
//   action: "onboard"         — legacy hosted Account Link (redirect)
//   action: "status"          — refresh payouts_enabled from Stripe
//   action: "admin_payout"    — release accrued earnings via Transfer
//
// Stripe key comes from Supabase Vault via public.get_app_secret.
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

async function ensureConnectedAccount(
  stripe: Stripe,
  provider: { id: string; business_name: string | null; stripe_account_id: string | null },
  userId: string,
  email: string | undefined,
): Promise<string> {
  if (provider.stripe_account_id) return provider.stripe_account_id

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'CA',
    email,
    business_type: 'individual',
    capabilities: { transfers: { requested: true } },
    business_profile: { name: provider.business_name ?? undefined },
    metadata: { wurx_provider_id: provider.id, supabase_user_id: userId },
  })

  await supabase
    .from('providers')
    .update({ stripe_account_id: account.id })
    .eq('id', provider.id)

  return account.id
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)
    const userId = userData.user.id

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = body?.action ?? 'account_session'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    // ---- admin_payout -------------------------------------------------
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
        console.error(
          `Transfer ${transfer.id} succeeded for provider ${targetProviderId} but recording it failed:`,
          payoutErr?.message,
        )
        return json(
          {
            error:
              'Transfer succeeded but recording it failed - contact support with transfer ' +
              transfer.id,
          },
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

    // Provider-scoped actions
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

    // ---- status -------------------------------------------------------
    if (action === 'status') {
      if (!accountId) return json({ payouts_enabled: false, onboarded: false })
      const account = await stripe.accounts.retrieve(accountId)
      const enabled = !!account.payouts_enabled

      if (enabled !== provider.payouts_enabled) {
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

    // ---- account_session: embedded onboarding (in-app) ---------------
    if (action === 'account_session') {
      accountId = await ensureConnectedAccount(
        stripe,
        provider,
        userId,
        userData.user.email,
      )

      const session = await stripe.accountSessions.create({
        account: accountId,
        components: {
          account_onboarding: {
            enabled: true,
            features: {
              external_account_collection: true,
            },
          },
          // Optional: show a banner later if Stripe needs more docs
          notification_banner: {
            enabled: true,
          },
        },
      })

      return json({ clientSecret: session.client_secret, accountId })
    }

    // ---- onboard: legacy hosted Account Link -------------------------
    if (action === 'onboard') {
      accountId = await ensureConnectedAccount(
        stripe,
        provider,
        userId,
        userData.user.email,
      )

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${siteUrl}/provider/dashboard?payouts=refresh`,
        return_url: `${siteUrl}/provider/dashboard?payouts=done`,
        type: 'account_onboarding',
      })

      return json({ url: link.url })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    console.error('provider-payouts error:', error)
    const message =
      error instanceof Stripe.errors.StripeError
        ? "Payouts aren't available yet -- we're finishing setup on our end. Check back soon."
        : (error as Error).message
    return json({ error: message }, 400)
  }
})
