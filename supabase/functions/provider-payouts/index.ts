// Stripe Connect onboarding + payout status for providers (verify_jwt = true).
//
// Supports:
//   action: "account_session" — in-app embedded onboarding (preferred)
//   action: "onboard"         — legacy hosted Account Link (redirect)
//   action: "status"          — refresh payouts_enabled from Stripe
//   action: "admin_payout"    — claim/reconcile an atomic earnings batch
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

  const { data: claimed, error: persistErr } = await supabase
    .from('providers')
    .update({ stripe_account_id: account.id })
    .eq('id', provider.id)
    .is('stripe_account_id', null)
    .select('stripe_account_id')
    .maybeSingle()

  if (persistErr) {
    console.error(
      `Created Stripe account ${account.id} for provider ${provider.id} but failed to persist stripe_account_id:`,
      persistErr.message,
    )
    throw new Error('Could not save your payout account. Please try again.')
  }

  if (claimed?.stripe_account_id) return claimed.stripe_account_id

  const { data: existing, error: existingError } = await supabase
    .from('providers')
    .select('stripe_account_id')
    .eq('id', provider.id)
    .maybeSingle()

  if (!existingError && existing?.stripe_account_id) {
    console.error(
      `Orphaned Stripe account ${account.id} for provider ${provider.id}: a concurrent request stored ${existing.stripe_account_id} first`,
    )
    return existing.stripe_account_id
  }

  throw new Error('Could not save your payout account. Please try again.')
}

type PayoutBatch = {
  batch_id: string
  provider_id: string
  amount_cents: number
  stripe_account_id: string
  idempotency_key: string
  stripe_transfer_id: string | null
  batch_status: string
}

function isExplicitStripeRejection(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeError)) return false
  return [
    'StripeInvalidRequestError',
    'StripeAuthenticationError',
    'StripePermissionError',
    'StripeCardError',
  ].includes(error.type)
}

async function markPayoutIssue(
  batchId: string,
  error: unknown,
  options: {
    transferId?: string | null
    reconciliationRequired?: boolean
  } = {},
) {
  const detail = error instanceof Error ? error.message : String(error)
  const { error: markError } = await supabase.rpc('mark_provider_payout_issue', {
    p_batch_id: batchId,
    p_error: detail,
    p_stripe_transfer_id: options.transferId ?? null,
    p_reconciliation_required: options.reconciliationRequired ?? false,
  })
  if (markError) {
    console.error(`Could not mark payout batch ${batchId}:`, markError.message)
  }
}

async function runAdminPayout(
  userId: string,
  providerId: string,
): Promise<Response> {
  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (callerError || callerProfile?.role !== 'admin') {
    return json({ error: 'Not authorized' }, 403)
  }

  const { data: batchRows, error: claimError } = await supabase.rpc(
    'claim_provider_payout_batch',
    {
      p_provider_id: providerId,
      p_released_by: userId,
    },
  )
  if (claimError) return json({ error: claimError.message }, 400)

  const batch = (Array.isArray(batchRows) ? batchRows[0] : batchRows) as
    | PayoutBatch
    | undefined
  if (!batch) return json({ error: 'Nothing owed to this provider' }, 400)

  if (batch.batch_status === 'reconciliation_required') {
    return json(
      {
        error: 'This payout has an ambiguous Stripe outcome and requires operator reconciliation before any retry.',
        batchId: batch.batch_id,
        transferId: batch.stripe_transfer_id,
        reconciliationRequired: true,
        retrySafe: false,
      },
      409,
    )
  }

  const stripeKey = await getStripeKey()
  if (!stripeKey) return json({ error: 'Payouts are not configured' }, 500)
  const stripe = new Stripe(stripeKey)

  let transferId = batch.stripe_transfer_id
  if (!transferId) {
    const { data: marked, error: markError } = await supabase.rpc(
      'mark_provider_payout_transferring',
      { p_batch_id: batch.batch_id },
    )
    if (markError || !marked) {
      return json(
        {
          error: markError?.message ?? 'Payout batch is no longer transferable',
          batchId: batch.batch_id,
        },
        409,
      )
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: batch.amount_cents,
          currency: 'cad',
          destination: batch.stripe_account_id,
          metadata: {
            wurx_provider_id: batch.provider_id,
            wurx_payout_batch_id: batch.batch_id,
          },
        },
        { idempotencyKey: batch.idempotency_key },
      )
      transferId = transfer.id
    } catch (error) {
      const explicitRejection = isExplicitStripeRejection(error)
      await markPayoutIssue(batch.batch_id, error, {
        reconciliationRequired: !explicitRejection,
      })

      if (!explicitRejection) {
        return json(
          {
            error: 'Stripe may have accepted the transfer, but the result was not confirmed. Operator reconciliation is required before any retry.',
            batchId: batch.batch_id,
            reconciliationRequired: true,
            retrySafe: false,
          },
          502,
        )
      }

      return json(
        {
          error: 'Stripe rejected the transfer before completion. The batch remains attached and can be retried after the rejection is corrected.',
          batchId: batch.batch_id,
          reconciliationRequired: false,
          retrySafe: true,
        },
        400,
      )
    }
  }

  const { data: finalized, error: finalizeError } = await supabase.rpc(
    'finalize_provider_payout_batch',
    {
      p_batch_id: batch.batch_id,
      p_stripe_transfer_id: transferId,
    },
  )

  if (finalizeError || !finalized) {
    await markPayoutIssue(
      batch.batch_id,
      finalizeError?.message ?? 'Transfer succeeded but local finalization failed',
      {
        transferId,
        reconciliationRequired: true,
      },
    )
    return json(
      {
        error: 'Transfer exists but local finalization requires reconciliation.',
        batchId: batch.batch_id,
        transferId,
        reconciliationRequired: true,
        retrySafe: false,
      },
      500,
    )
  }

  return json({
    paid: true,
    batchId: batch.batch_id,
    amountCents: batch.amount_cents,
    transferId,
    idempotencyKey: batch.idempotency_key,
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const action = body?.action ?? 'account_session'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://wurx.vercel.app'

    if (action === 'admin_payout') {
      const targetProviderId =
        typeof body?.providerId === 'string' ? body.providerId.trim() : ''
      if (!targetProviderId) return json({ error: 'providerId is required' }, 400)
      return await runAdminPayout(userId, targetProviderId)
    }

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, business_name, stripe_account_id, payouts_enabled, verification')
      .eq('user_id', userId)
      .maybeSingle()

    if (providerError) return json({ error: providerError.message }, 500)
    if (!provider) return json({ error: 'You are not a registered provider' }, 403)

    const stripeKey = await getStripeKey()
    if (!stripeKey) return json({ error: 'Payouts are not configured' }, 500)
    const stripe = new Stripe(stripeKey)

    let accountId: string | null = provider.stripe_account_id

    if (action === 'status') {
      if (!accountId) return json({ payouts_enabled: false, onboarded: false })
      const account = await stripe.accounts.retrieve(accountId)
      const enabled = !!account.payouts_enabled

      if (enabled !== provider.payouts_enabled) {
        const { error: syncErr } = await supabase
          .from('providers')
          .update({ payouts_enabled: enabled })
          .eq('id', provider.id)

        if (syncErr) {
          console.error(
            `Failed to sync payouts_enabled=${enabled} for provider ${provider.id}:`,
            syncErr.message,
          )
          return json({ error: 'Could not refresh your payout status. Please try again.' }, 500)
        }
      }

      return json({
        payouts_enabled: enabled,
        onboarded: !!account.details_submitted,
        requirements: account.requirements?.currently_due ?? [],
      })
    }

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
            features: { external_account_collection: true },
          },
          notification_banner: { enabled: true },
        },
      })

      return json({ clientSecret: session.client_secret, accountId })
    }

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
        : error instanceof Error
          ? error.message
          : 'Payout operation failed'
    return json({ error: message }, 400)
  }
})
