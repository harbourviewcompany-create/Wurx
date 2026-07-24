import Stripe from 'npm:stripe@^14'
import { createClient } from 'npm:@supabase/supabase-js'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('Stripe-Signature')!
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
      undefined,
      cryptoProvider
    )
  } catch (err: any) {
    console.error(`Webhook signature verification failed.`, err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const { type, data } = event

  if (type === 'checkout.session.completed') {
    const session = data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    const hours = parseInt(session.metadata?.hours || '0')

    if (userId && hours > 0) {
      // Credit hours to user
      await supabase.from('hour_ledger').insert({
        user_id: userId,
        amount: hours,
        type: 'credit',
        description: 'Initial subscription hours'
      })
    }
  }

  // Add more events: invoice.paid, customer.subscription.deleted, etc.

  return new Response('OK', { status: 200 })
})
