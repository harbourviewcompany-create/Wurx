// Retry-safe email + SMS notification dispatcher (verify_jwt = false).
//
// A scheduler must present the mandatory NOTIFY_DISPATCH_SECRET in
// X-Dispatch-Secret. Rows are claimed atomically through service-role-only RPCs
// using FOR UPDATE SKIP LOCKED. Explicit provider rejections are retried with
// bounded backoff and attempts; ambiguous outcomes and stale started deliveries
// enter reconciliation and are never auto-resent.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const KEY_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
] as const
const BATCH = 50
const CLAIM_TIMEOUT_SECONDS = 15 * 60
const MAX_DELIVERY_ATTEMPTS = 8

class ProviderRejectedError extends Error {}

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

function secureEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return difference === 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function retrySeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, Math.min(attempt - 1, 7)))
}

type Channel = 'email' | 'sms'
type ClaimedNotification = {
  notification_id: string
  user_id: string
  title: string
  body: string | null
  attempt_count: number
  delivery_key: string
}

async function recoverStaleDeliveries(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc(
    'recover_stale_notification_deliveries',
    { p_stale_seconds: CLAIM_TIMEOUT_SECONDS },
  )
  if (error) throw new Error(`Stale delivery recovery failed: ${error.message}`)
  return typeof data === 'number' ? data : Number(data ?? 0)
}

async function claim(
  supabase: SupabaseClient,
  channel: Channel,
  claimToken: string,
): Promise<ClaimedNotification[]> {
  const { data, error } = await supabase.rpc('claim_notification_deliveries', {
    p_channel: channel,
    p_limit: BATCH,
    p_claim_token: claimToken,
  })
  if (error) throw new Error(`${channel} queue claim failed: ${error.message}`)
  return (data ?? []) as ClaimedNotification[]
}

async function startDelivery(
  supabase: SupabaseClient,
  channel: Channel,
  notificationId: string,
  claimToken: string,
) {
  const { data, error } = await supabase.rpc('start_notification_delivery', {
    p_channel: channel,
    p_notification_id: notificationId,
    p_claim_token: claimToken,
  })
  if (error || !data) {
    throw new Error(
      `${channel} delivery start failed: ${error?.message ?? 'claim token no longer owns the row'}`,
    )
  }
}

async function complete(
  supabase: SupabaseClient,
  channel: Channel,
  notificationId: string,
  claimToken: string,
  providerMessageId: string,
) {
  const { data, error } = await supabase.rpc('complete_notification_delivery', {
    p_channel: channel,
    p_notification_id: notificationId,
    p_claim_token: claimToken,
    p_provider_message_id: providerMessageId,
  })
  if (error || !data) {
    throw new Error(
      `${channel} completion failed: ${error?.message ?? 'claim token no longer owns the row'}`,
    )
  }
}

async function fail(
  supabase: SupabaseClient,
  channel: Channel,
  notification: ClaimedNotification,
  claimToken: string,
  error: unknown,
  retryOverride?: number,
) {
  const detail = errorMessage(error).slice(0, 2000)
  const { data, error: releaseError } = await supabase.rpc(
    'fail_notification_delivery',
    {
      p_channel: channel,
      p_notification_id: notification.notification_id,
      p_claim_token: claimToken,
      p_error: detail,
      p_retry_seconds: retryOverride ?? retrySeconds(notification.attempt_count),
    },
  )
  if (releaseError || !data) {
    console.error(
      `${channel} delivery ${notification.notification_id} failed and its claim could not be released:`,
      releaseError?.message ?? 'claim token no longer owns the row',
    )
  }
  return detail
}

async function reconcile(
  supabase: SupabaseClient,
  channel: Channel,
  notification: ClaimedNotification,
  claimToken: string,
  error: unknown,
  providerMessageId: string | null,
) {
  const detail = errorMessage(error).slice(0, 2000)
  const { data, error: reconciliationError } = await supabase.rpc(
    'mark_notification_delivery_reconciliation',
    {
      p_channel: channel,
      p_notification_id: notification.notification_id,
      p_claim_token: claimToken,
      p_error: detail,
      p_provider_message_id: providerMessageId,
    },
  )
  if (reconciliationError || !data) {
    console.error(
      `${channel} delivery ${notification.notification_id} has an ambiguous provider outcome and could not be marked for reconciliation:`,
      reconciliationError?.message ?? 'claim token no longer owns the row',
    )
  }
  return detail
}

async function pendingCount(
  supabase: SupabaseClient,
  column: 'email_pending' | 'sms_pending',
) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq(column, true)
  if (error) throw new Error(`Queue count failed: ${error.message}`)
  return count ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const key = resolveKey()
  if (!key) return json({ error: 'No elevated key in the function environment' }, 500)

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    key.value,
  )

  async function secret(
    name: string,
  ): Promise<{ value: string | null; readable: boolean }> {
    const { data, error } = await supabase.rpc('get_app_secret', { p_name: name })
    if (error) {
      console.error(`Vault read failed for ${name}:`, error.message)
      return { value: null, readable: false }
    }
    const value = typeof data === 'string' ? data.trim() : ''
    return { value: value || null, readable: true }
  }

  const dispatchSecret = await secret('NOTIFY_DISPATCH_SECRET')
  if (!dispatchSecret.readable || !dispatchSecret.value) {
    return json(
      { error: 'Notification dispatch secret is unavailable; refusing to run' },
      503,
    )
  }

  const suppliedSecret = req.headers.get('X-Dispatch-Secret') ?? ''
  if (!suppliedSecret || !secureEqual(suppliedSecret, dispatchSecret.value)) {
    return json({ error: 'Forbidden' }, 403)
  }

  const staleRecovered = await recoverStaleDeliveries(supabase)

  const resend = await secret('RESEND_API_KEY')
  const fromSecret = await secret('NOTIFY_FROM_EMAIL')
  const twilioSid = await secret('TWILIO_ACCOUNT_SID')
  const twilioToken = await secret('TWILIO_AUTH_TOKEN')
  const twilioFrom = await secret('TWILIO_FROM_NUMBER')

  const emailReady = resend.readable && !!resend.value
  const smsReady =
    twilioSid.readable && twilioToken.readable && twilioFrom.readable &&
    !!twilioSid.value && !!twilioToken.value && !!twilioFrom.value
  const from = fromSecret.value ?? 'Wurx <notifications@wurx.ca>'

  let emailSent = 0
  let emailFailed = 0
  let emailReconciliation = 0
  let smsSent = 0
  let smsFailed = 0
  let smsReconciliation = 0
  let lastError: string | null = null

  if (emailReady) {
    const claimToken = crypto.randomUUID()
    const claimed = await claim(supabase, 'email', claimToken)
    const userIds = [...new Set(claimed.map((n) => n.user_id))]
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from('profiles').select('id, email').in('id', userIds)
      : { data: [], error: null }
    if (profileError) throw new Error(`Email recipient lookup failed: ${profileError.message}`)
    const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]))

    for (const notification of claimed) {
      const to = emailOf.get(notification.user_id)
      if (!to) {
        emailFailed++
        lastError = await fail(
          supabase, 'email', notification, claimToken,
          'Recipient email is missing', 86400,
        )
        continue
      }

      let providerMessageId: string | null = null
      try {
        await startDelivery(
          supabase, 'email', notification.notification_id, claimToken,
        )
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resend.value}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': notification.delivery_key,
          },
          body: JSON.stringify({
            from,
            to,
            subject: notification.title,
            text: `${notification.title}\n\n${notification.body ?? ''}\n\nhttps://wurx.vercel.app/dashboard`,
          }),
        })
        const responseText = await response.text()
        if (!response.ok) {
          throw new ProviderRejectedError(
            `Resend ${response.status}: ${responseText.slice(0, 500)}`,
          )
        }
        const provider = JSON.parse(responseText || '{}') as { id?: string }
        providerMessageId = provider.id ?? notification.delivery_key
        await complete(
          supabase, 'email', notification.notification_id,
          claimToken, providerMessageId,
        )
        emailSent++
      } catch (error) {
        if (error instanceof ProviderRejectedError) {
          emailFailed++
          lastError = await fail(
            supabase, 'email', notification, claimToken, error,
          )
        } else {
          emailReconciliation++
          lastError = await reconcile(
            supabase, 'email', notification, claimToken, error, providerMessageId,
          )
        }
        console.error('Email delivery did not finalize', notification.notification_id, lastError)
      }
    }
  }

  if (smsReady) {
    const claimToken = crypto.randomUUID()
    const claimed = await claim(supabase, 'sms', claimToken)
    const userIds = [...new Set(claimed.map((n) => n.user_id))]
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from('profiles').select('id, phone').in('id', userIds)
      : { data: [], error: null }
    if (profileError) throw new Error(`SMS recipient lookup failed: ${profileError.message}`)
    const phoneOf = new Map((profiles ?? []).map((p) => [p.id, p.phone]))

    for (const notification of claimed) {
      const normalized = (phoneOf.get(notification.user_id) ?? '').replace(/[^\d+]/g, '')
      if (!normalized || normalized.length < 10) {
        smsFailed++
        lastError = await fail(
          supabase, 'sms', notification, claimToken,
          'Recipient phone number is missing or invalid', 86400,
        )
        continue
      }
      const e164 = normalized.startsWith('+')
        ? normalized
        : `+1${normalized.replace(/^1/, '')}`

      let providerMessageId: string | null = null
      try {
        await startDelivery(
          supabase, 'sms', notification.notification_id, claimToken,
        )
        const body = new URLSearchParams({
          To: e164,
          From: twilioFrom.value!,
          Body: `Wurx: ${notification.title}${notification.body ? ` — ${notification.body}` : ''}`.slice(0, 320),
        })
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid.value}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + btoa(`${twilioSid.value}:${twilioToken.value}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        )
        const responseText = await response.text()
        if (!response.ok) {
          throw new ProviderRejectedError(
            `Twilio ${response.status}: ${responseText.slice(0, 500)}`,
          )
        }
        const provider = JSON.parse(responseText || '{}') as { sid?: string }
        providerMessageId = provider.sid ?? null
        if (!providerMessageId) {
          throw new Error('Twilio accepted the request without returning a Message SID')
        }
        await complete(
          supabase, 'sms', notification.notification_id,
          claimToken, providerMessageId,
        )
        smsSent++
      } catch (error) {
        if (error instanceof ProviderRejectedError) {
          smsFailed++
          lastError = await fail(
            supabase, 'sms', notification, claimToken, error,
          )
        } else {
          smsReconciliation++
          lastError = await reconcile(
            supabase, 'sms', notification, claimToken, error, providerMessageId,
          )
        }
        console.error('SMS delivery did not finalize', notification.notification_id, lastError)
      }
    }
  }

  const [emailPending, smsPending] = await Promise.all([
    pendingCount(supabase, 'email_pending'),
    pendingCount(supabase, 'sms_pending'),
  ])

  return json({
    recovery: {
      staleMovedToReconciliation: staleRecovered,
      claimTimeoutSeconds: CLAIM_TIMEOUT_SECONDS,
      maxAttempts: MAX_DELIVERY_ATTEMPTS,
    },
    email: {
      configured: emailReady,
      sent: emailSent,
      failed: emailFailed,
      reconciliationRequired: emailReconciliation,
      pending: emailPending,
    },
    sms: {
      configured: smsReady,
      sent: smsSent,
      failed: smsFailed,
      reconciliationRequired: smsReconciliation,
      pending: smsPending,
    },
    lastError,
    keySource: key.name,
  })
})
