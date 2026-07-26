// Drains the notification email queue (verify_jwt = false — invoked by a
// schedule, authenticated by a shared secret in Vault).
//
// Notifications are written by database triggers with email_pending = true.
// This sends each one via Resend and marks it delivered. If no RESEND_API_KEY
// is present in Vault the function no-ops gracefully, so in-app notifications
// keep working and email can be switched on later by adding the key alone.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Supabase injects the elevated key under different names depending on when the
// project was created (legacy JWT `service_role` vs. the newer `sb_secret_…`).
// Reading only one of them silently produces an un-elevated client: RLS then
// filters every row out, the queue reads as empty, and the dispatcher reports
// success while delivering nothing.
const KEY_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
] as const

function resolveKey(): { name: string; value: string } | null {
  for (const name of KEY_ENV_NAMES) {
    const value = Deno.env.get(name)
    if (value && value.trim() !== '') return { name, value }
  }
  return null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const BATCH = 50

Deno.serve(async (req: Request) => {
  const key = resolveKey()
  if (!key) {
    // Fail loudly: a silent no-op here is indistinguishable from an empty queue.
    return json({ error: 'No elevated key in the function environment' }, 500)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, key.value)

  async function secret(name: string): Promise<{ value: string | null; readable: boolean }> {
    const { data, error } = await supabase.rpc('get_app_secret', { p_name: name })
    if (error) return { value: null, readable: false }
    return { value: (data as string) ?? null, readable: true }
  }

  // Shared-secret auth: this endpoint runs without JWT verification so a
  // scheduler can call it, so it must not be openly invokable. If Vault can't
  // be read we cannot authenticate the caller — fail closed rather than
  // skipping the check, which would leave the endpoint open to anyone.
  const dispatchSecret = await secret('NOTIFY_DISPATCH_SECRET')
  if (!dispatchSecret.readable) {
    return json({ error: 'Cannot read the dispatch secret; refusing to run unauthenticated' }, 503)
  }
  if (dispatchSecret.value) {
    if (req.headers.get('X-Dispatch-Secret') !== dispatchSecret.value) {
      return json({ error: 'Forbidden' }, 403)
    }
  }

  const apiKey = (await secret('RESEND_API_KEY')).value
  const from = (await secret('NOTIFY_FROM_EMAIL')).value ?? 'Wurx <notifications@wurx.ca>'

  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, user_id, kind, title, body')
    .eq('email_pending', true)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) return json({ error: error.message }, 500)
  if (!pending?.length) return json({ sent: 0, skipped: 0, pending: 0 })

  // Without an email provider configured, drain the queue flag so it doesn't
  // grow unbounded — the in-app notification remains the source of truth.
  if (!apiKey) {
    await supabase
      .from('notifications')
      .update({ email_pending: false })
      .in('id', pending.map((n) => n.id))
    return json({
      sent: 0,
      skipped: pending.length,
      pending: pending.length,
      reason: 'RESEND_API_KEY not set',
    })
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds)
  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]))

  let sent = 0
  let skipped = 0
  let lastError: string | null = null

  for (const n of pending) {
    const to = emailOf.get(n.user_id)
    if (!to) {
      skipped++
      await supabase.from('notifications').update({ email_pending: false }).eq('id', n.id)
      continue
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: n.title,
          text: `${n.title}\n\n${n.body ?? ''}\n\nManage your bookings: https://wurx.vercel.app/dashboard`,
        }),
      })

      if (!res.ok) {
        // Surfaced in the response too: this runs unattended, and a provider
        // rejection that only reaches the logs is a rejection nobody sees.
        lastError = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`
        console.error('Resend failed', n.id, lastError)
        continue // leave pending so the next run retries
      }

      await supabase
        .from('notifications')
        .update({ email_pending: false, emailed_at: new Date().toISOString() })
        .eq('id', n.id)
      sent++
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error('Send error', n.id, lastError)
    }
  }

  return json({ sent, skipped, pending: pending.length, lastError })
})
