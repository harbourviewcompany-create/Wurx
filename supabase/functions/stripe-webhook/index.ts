// Stripe webhook endpoint (verify_jwt = false).
//
// Stripe authenticates with its webhook signature. Every verified event is
// persisted before processing, claimed atomically, and acknowledged only after
// successful processing or a confirmed prior success. Recoverable failures and
// duplicate deliveries that arrive while processing is still active return a
// retryable response so Stripe remains the durable recovery driver.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  processStoredStripeEvent,
  storeStripeEvent,
} from '../_shared/stripe-event-processor.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_webhook_verification_only')
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    })
  }

  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()
  if (!signature) return new Response('Missing Stripe-Signature header', { status: 400 })

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
      cryptoProvider,
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return new Response('Invalid Stripe signature', { status: 400 })
  }

  try {
    await storeStripeEvent(supabase, event)
    const state = await processStoredStripeEvent(supabase, event.id)

    if (state === 'in_progress') {
      return new Response(
        JSON.stringify({
          received: true,
          processed: false,
          eventId: event.id,
          state,
          retryable: true,
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      )
    }

    return new Response(JSON.stringify({ received: true, eventId: event.id, state }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(`Stripe event ${event.id} failed:`, error)
    return new Response(
      JSON.stringify({
        received: true,
        processed: false,
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Stripe event processing failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
