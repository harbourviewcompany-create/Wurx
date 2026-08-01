// Admin-only replay for events already stored in the verified Stripe inbox.
// verify_jwt = true; the function also revalidates the JWT and admin role.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { processStoredStripeEvent } from '../_shared/stripe-event-processor.ts'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (profileError || profile?.role !== 'admin') {
    return json({ error: 'Not authorized' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  if (!eventId) return json({ error: 'eventId is required' }, 400)

  const { data: queued, error: queueError } = await supabase.rpc(
    'requeue_stripe_event',
    {
      p_event_id: eventId,
      p_requested_by: userData.user.id,
    },
  )
  if (queueError) return json({ error: queueError.message }, 500)
  if (!queued) {
    return json(
      { error: 'Event was not found or is currently being processed' },
      409,
    )
  }

  try {
    const state = await processStoredStripeEvent(supabase, eventId)
    return json({ replayed: true, eventId, state })
  } catch (error) {
    console.error(`Stripe replay ${eventId} failed:`, error)
    return json(
      {
        replayed: false,
        eventId,
        error: error instanceof Error ? error.message : 'Replay failed',
      },
      500,
    )
  }
})
