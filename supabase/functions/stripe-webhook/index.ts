// Deployed to Supabase project rzdavbuoisckvdapbcbj (verify_jwt = false — Stripe
// authenticates via the webhook signature, not a Supabase JWT).
//
// The webhook signing secret is stored in Supabase Vault (not in env or in this
// file) and read at runtime via the service-role-only RPC public.get_app_secret,
// so no secret lives in this public repo. Redeploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// This handler is self-contained: it records/updates subscriptions and grants
// minutes entirely from the event payloads, so it does NOT require STRIPE_SECRET_KEY.
// (create-checkout still needs STRIPE_SECRET_KEY to start a Checkout session.)
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Only used for signature verification (constructEventAsync), which does not call
// the Stripe API — so a real secret key is not required here.
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_webhook_verification_only')
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function getSigningSecret(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_app_secret', {
    p_name: 'STRIPE_WEBHOOK_SIGNING_SECRET',
  })
  if (error) {
    console.error('Failed to read signing secret from Vault:', error.message)
    return null
  }
  return (data as string) ?? null
}

function periodDates(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as any
  const start = (sub as any).current_period_start ?? item?.current_period_start
  const end = (sub as any).current_period_end ?? item?.current_period_end
  return {
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  }
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  if (!signature) {
    return new Response('Missing Stripe-Signature header', { status: 400 })
  }

  const signingSecret = await getSigningSecret()
  if (!signingSecret) {
    return new Response('Webhook signing secret not configured', { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      signingSecret,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    console.error('Webhook signature verification failed.', (err as Error).message)
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Record the subscription from the session payload — no Stripe API call.
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planId = session.metadata?.plan_id ?? null
        const stripeSubscriptionId = session.subscription as string | null

        if (userId && stripeSubscriptionId) {
          // Look the plan's price id up locally (nice-to-have, still no Stripe call).
          let stripePriceId: string | null = null
          if (planId) {
            const { data: plan } = await supabase
              .from('plans')
              .select('stripe_price_id')
              .eq('id', planId)
              .single()
            stripePriceId = plan?.stripe_price_id ?? null
          }

          await supabase.from('subscriptions').upsert(
            {
              user_id: userId,
              plan_id: planId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_price_id: stripePriceId,
              status: 'active',
            },
            { onConflict: 'stripe_subscription_id' }
          )
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSubscriptionId = (invoice as any).subscription as string | null
        if (!stripeSubscriptionId) break

        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('id, user_id, plan_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single()

        if (!subRow) break

        // Keep the subscription period fresh from the invoice line (no Stripe call).
        const line = (invoice as any).lines?.data?.[0]
        if (line?.period) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              current_period_start: line.period.start
                ? new Date(line.period.start * 1000).toISOString()
                : null,
              current_period_end: line.period.end
                ? new Date(line.period.end * 1000).toISOString()
                : null,
            })
            .eq('id', subRow.id)
        }

        let monthlyMinutes: number | null = null
        if (subRow.plan_id) {
          const { data: plan } = await supabase
            .from('plans')
            .select('monthly_minutes')
            .eq('id', subRow.plan_id)
            .single()
          monthlyMinutes = plan?.monthly_minutes ?? null
        }

        if (monthlyMinutes) {
          // stripe_event_id is UNIQUE in hour_ledger, so Stripe's retries (on any
          // non-2xx) can never double-credit the same invoice event.
          await supabase.from('hour_ledger').insert({
            user_id: subRow.user_id,
            delta_minutes: monthlyMinutes,
            entry_type: 'grant',
            description: 'Subscription period credit',
            subscription_id: subRow.id,
            stripe_event_id: event.id,
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            ...periodDates(sub),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      default:
        break
    }
  } catch (err) {
    // Log but still ack so Stripe doesn't retry forever on a bug on our end; the
    // stripe_event_id unique constraint means a safe retry never double-credits.
    console.error(`Error handling ${event.type}:`, err)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
