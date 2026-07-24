// Deployed to Supabase project rzdavbuoisckvdapbcbj (verify_jwt = false — Stripe
// authenticates via the webhook signature, not a Supabase JWT).
// This file mirrors the live function; keep them in sync — redeploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  if (!signature) {
    return new Response('Missing Stripe-Signature header', { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
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
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planId = session.metadata?.plan_id
        const stripeSubscriptionId = session.subscription as string | null

        if (userId && stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
          const item = sub.items.data[0]
          const periodStart = (sub as any).current_period_start ?? item?.current_period_start
          const periodEnd = (sub as any).current_period_end ?? item?.current_period_end

          await supabase
            .from('subscriptions')
            .upsert(
              {
                user_id: userId,
                plan_id: planId ?? null,
                stripe_subscription_id: sub.id,
                stripe_price_id: item?.price.id ?? null,
                status: sub.status,
                current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
                current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
                cancel_at_period_end: sub.cancel_at_period_end,
              },
              { onConflict: 'stripe_subscription_id' }
            )
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSubscriptionId = invoice.subscription as string | null
        if (!stripeSubscriptionId) break

        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('id, user_id, plan_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single()

        if (!subRow) break

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
          // stripe_event_id is UNIQUE in hour_ledger, so retried webhook deliveries
          // (Stripe retries on any non-2xx) can never double-credit the same invoice event.
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

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const item = sub.items.data[0]
        const periodStart = (sub as any).current_period_start ?? item?.current_period_start
        const periodEnd = (sub as any).current_period_end ?? item?.current_period_end

        await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
            current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      default:
        break
    }
  } catch (err) {
    // Log but still ack so Stripe doesn't retry forever on a bug on our end;
    // the stripe_event_id unique constraint means a safe retry never double-credits.
    console.error(`Error handling ${event.type}:`, err)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
