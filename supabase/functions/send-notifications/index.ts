// Drains notification email + optional SMS queues.
// Email: Resend (RESEND_API_KEY). SMS: Twilio (TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER). Missing provider keys → drain flags, no-op.
//
// Auth: scheduler calls this with X-Dispatch-Secret (verify_jwt off). Fail closed
// if Vault cannot be read for the secret. Surface provider failures in the JSON
// body so ops is not limited to function logs.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

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
    return json({ error: 'No elevated key in the function environment' }, 500)
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    key.value,
  )

  async function secret(
    name: string,
  ): Promise<{ value: string | null; readable: boolean }> {
    const { data, error } = await supabase.rpc('get_app_secret', { p_name: name })
    if (error) return { value: null, readable: false }
    return { value: (data as string) ?? null, readable: true }
  }

  // Shared-secret auth. If Vault can't be read we cannot authenticate the
  // caller — refuse rather than skipping the check (old behaviour left the
  // endpoint open when the secret was unreadable).
  const dispatchSecret = await secret('NOTIFY_DISPATCH_SECRET')
  if (!dispatchSecret.readable) {
    return json(
      {
        error:
          'Cannot read the dispatch secret; refusing to run unauthenticated',
      },
      503,
    )
  }
  if (dispatchSecret.value) {
    if (req.headers.get('X-Dispatch-Secret') !== dispatchSecret.value) {
      return json({ error: 'Forbidden' }, 403)
    }
  }

  const apiKey = (await secret('RESEND_API_KEY')).value
  const from =
    (await secret('NOTIFY_FROM_EMAIL')).value ?? 'Wurx <notifications@wurx.ca>'
  const twilioSid = (await secret('TWILIO_ACCOUNT_SID')).value
  const twilioToken = (await secret('TWILIO_AUTH_TOKEN')).value
  const twilioFrom = (await secret('TWILIO_FROM_NUMBER')).value
  const twilioReady = !!(twilioSid && twilioToken && twilioFrom)

  let lastError: string | null = null

  // ---- Email queue ----
  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, user_id, kind, title, body')
    .eq('email_pending', true)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) return json({ error: error.message }, 500)

  let emailSent = 0
  let emailSkipped = 0
  const emailPending = pending?.length ?? 0

  if (pending?.length) {
    if (!apiKey) {
      await supabase
        .from('notifications')
        .update({ email_pending: false })
        .in(
          'id',
          pending.map((n) => n.id),
        )
      emailSkipped = pending.length
    } else {
      const userIds = [...new Set(pending.map((n) => n.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
      const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]))

      for (const n of pending) {
        const to = emailOf.get(n.user_id)
        if (!to) {
          emailSkipped++
          await supabase
            .from('notifications')
            .update({ email_pending: false })
            .eq('id', n.id)
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
              text: `${n.title}\n\n${n.body ?? ''}\n\nhttps://wurx.vercel.app/dashboard`,
            }),
          })
          if (!res.ok) {
            lastError = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`
            console.error('Resend failed', n.id, lastError)
            continue // leave pending for retry
          }
          await supabase
            .from('notifications')
            .update({
              email_pending: false,
              emailed_at: new Date().toISOString(),
            })
            .eq('id', n.id)
          emailSent++
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          console.error('Send error', n.id, lastError)
        }
      }
    }
  }

  // ---- SMS queue ----
  const { data: smsPending } = await supabase
    .from('notifications')
    .select('id, user_id, title, body')
    .eq('sms_pending', true)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  let smsSent = 0
  let smsSkipped = 0
  const smsPendingCount = smsPending?.length ?? 0

  if (smsPending?.length) {
    if (!twilioReady) {
      await supabase
        .from('notifications')
        .update({ sms_pending: false })
        .in(
          'id',
          smsPending.map((n) => n.id),
        )
      smsSkipped = smsPending.length
    } else {
      const userIds = [...new Set(smsPending.map((n) => n.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone')
        .in('id', userIds)
      const phoneOf = new Map((profiles ?? []).map((p) => [p.id, p.phone]))

      for (const n of smsPending) {
        const to = (phoneOf.get(n.user_id) ?? '').replace(/[^\d+]/g, '')
        if (!to || to.length < 10) {
          smsSkipped++
          await supabase
            .from('notifications')
            .update({ sms_pending: false })
            .eq('id', n.id)
          continue
        }
        const e164 = to.startsWith('+') ? to : `+1${to.replace(/^1/, '')}`
        try {
          const body = new URLSearchParams({
            To: e164,
            From: twilioFrom!,
            Body: `Wurx: ${n.title}${n.body ? ` — ${n.body}` : ''}`.slice(0, 320),
          })
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
            },
          )
          if (!res.ok) {
            lastError = `Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`
            console.error('Twilio failed', n.id, lastError)
            continue
          }
          await supabase
            .from('notifications')
            .update({
              sms_pending: false,
              sms_sent_at: new Date().toISOString(),
            })
            .eq('id', n.id)
          smsSent++
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          console.error('SMS error', n.id, lastError)
        }
      }
    }
  }

  return json({
    email: {
      sent: emailSent,
      skipped: emailSkipped,
      pending: emailPending,
    },
    sms: {
      sent: smsSent,
      skipped: smsSkipped,
      pending: smsPendingCount,
      configured: twilioReady,
    },
    lastError,
    keySource: key.name,
  })
})
