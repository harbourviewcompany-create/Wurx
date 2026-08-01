import Stripe from 'npm:stripe@^17'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type StripeEventProcessState =
  | 'processed'
  | 'already_processed'
  | 'in_progress'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.trim() ? id : null
  }
  return null
}

function metadataValue(value: unknown): Record<string, string> {
  const record = asRecord(value)
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string',
    ),
  )
}

function periodFromLine(line: Record<string, unknown>) {
  const period = asRecord(line.period)
  const start = typeof period.start === 'number' ? period.start : null
  const end = typeof period.end === 'number' ? period.end : null
  return {
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  }
}

function periodFromSubscription(subscription: Stripe.Subscription) {
  const sub = subscription as unknown as Record<string, unknown>
  const itemsData = asRecord(sub.items).data
  const firstItem = Array.isArray(itemsData) ? asRecord(itemsData[0]) : {}
  const start =
    typeof sub.current_period_start === 'number'
      ? sub.current_period_start
      : typeof firstItem.current_period_start === 'number'
        ? firstItem.current_period_start
        : null
  const end =
    typeof sub.current_period_end === 'number'
      ? sub.current_period_end
      : typeof firstItem.current_period_end === 'number'
        ? firstItem.current_period_end
        : null
  return {
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  }
}

type Entitlement = {
  stripe_price_id: string
  plan_id: string
  monthly_minutes: number
  price_cents: number
  currency: string
}

async function entitlementForPrice(
  supabase: SupabaseClient,
  priceId: string,
): Promise<Entitlement> {
  const { data, error } = await supabase
    .from('stripe_price_entitlements')
    .select('stripe_price_id, plan_id, monthly_minutes, price_cents, currency')
    .eq('stripe_price_id', priceId)
    .single()

  if (error || !data) {
    throw new Error(
      `No immutable entitlement exists for Stripe Price ${priceId}: ${error?.message ?? 'not found'}`,
    )
  }
  return data as Entitlement
}

async function entitlementForCheckout(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<Entitlement> {
  const priceId = session.metadata?.stripe_price_id
  if (priceId) return entitlementForPrice(supabase, priceId)

  // Compatibility for sessions created immediately before the hardened
  // checkout metadata deployed. The plan lookup still resolves to an immutable
  // entitlement snapshot rather than reading mutable plan minutes.
  const planId = session.metadata?.plan_id
  if (!planId) throw new Error('Checkout session has no Stripe Price or plan metadata')

  const { data, error } = await supabase
    .from('stripe_price_entitlements')
    .select('stripe_price_id, plan_id, monthly_minutes, price_cents, currency')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    throw new Error(
      `No immutable entitlement exists for checkout plan ${planId}: ${error?.message ?? 'not found'}`,
    )
  }
  return data as Entitlement
}

async function existingSubscription(
  supabase: SupabaseClient,
  stripeSubscriptionId: string,
) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan_id, stripe_price_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle()
  if (error) throw new Error(`Subscription lookup failed: ${error.message}`)
  return data as
    | {
        id: string
        user_id: string
        plan_id: string | null
        stripe_price_id: string | null
      }
    | null
}

async function upsertSubscription(
  supabase: SupabaseClient,
  values: {
    userId: string
    stripeSubscriptionId: string
    stripePriceId: string
    planId: string
    status: string
    cancelAtPeriodEnd?: boolean
    currentPeriodStart?: string | null
    currentPeriodEnd?: string | null
  },
) {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: values.userId,
        plan_id: values.planId,
        stripe_subscription_id: values.stripeSubscriptionId,
        stripe_price_id: values.stripePriceId,
        status: values.status,
        cancel_at_period_end: values.cancelAtPeriodEnd ?? false,
        current_period_start: values.currentPeriodStart ?? null,
        current_period_end: values.currentPeriodEnd ?? null,
      },
      { onConflict: 'stripe_subscription_id' },
    )
    .select('id, user_id, plan_id')
    .single()

  if (error || !data) {
    throw new Error(`Subscription write failed: ${error?.message ?? 'no row returned'}`)
  }
  return data as { id: string; user_id: string; plan_id: string | null }
}

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null
}

function invoiceParts(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as Record<string, unknown>
  const parent = asRecord(raw.parent)
  const subscriptionDetails = asRecord(
    parent.subscription_details ?? raw.subscription_details,
  )
  const lines = asRecord(raw.lines)
  const line = asRecord(Array.isArray(lines.data) ? lines.data[0] : null)
  const pricing = asRecord(line.pricing)
  const priceDetails = asRecord(pricing.price_details)
  const legacyPrice = asRecord(line.price)

  return {
    subscriptionId:
      stringValue(raw.subscription) ?? stringValue(subscriptionDetails.subscription),
    priceId:
      stringValue(priceDetails.price) ?? stringValue(legacyPrice.id),
    metadata: metadataValue(subscriptionDetails.metadata),
    line,
  }
}

async function processCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  const userId = session.metadata?.userId ?? session.client_reference_id
  const stripeSubscriptionId = stringValue(session.subscription)
  if (!userId || !stripeSubscriptionId) {
    throw new Error('checkout.session.completed is missing its bound user or subscription')
  }

  const entitlement = await entitlementForCheckout(supabase, session)
  await upsertSubscription(supabase, {
    userId,
    stripeSubscriptionId,
    stripePriceId: entitlement.stripe_price_id,
    planId: entitlement.plan_id,
    status: 'active',
  })
}

async function processInvoicePaid(
  supabase: SupabaseClient,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
) {
  const parts = invoiceParts(invoice)
  if (!parts.subscriptionId || !parts.priceId) {
    throw new Error('invoice.paid is missing its subscription or Stripe Price')
  }

  const existing = await existingSubscription(supabase, parts.subscriptionId)
  const userId = parts.metadata.userId ?? existing?.user_id
  if (!userId) {
    throw new Error(
      `invoice.paid cannot resolve the Wurx user for subscription ${parts.subscriptionId}`,
    )
  }

  const entitlement = await entitlementForPrice(supabase, parts.priceId)
  const period = periodFromLine(parts.line)
  const subscription = await upsertSubscription(supabase, {
    userId,
    stripeSubscriptionId: parts.subscriptionId,
    stripePriceId: parts.priceId,
    planId: entitlement.plan_id,
    status: 'active',
    currentPeriodStart: period.current_period_start,
    currentPeriodEnd: period.current_period_end,
  })

  const { error: grantError } = await supabase.from('hour_ledger').insert({
    user_id: userId,
    delta_minutes: entitlement.monthly_minutes,
    entry_type: 'grant',
    description: `Subscription period credit (${parts.priceId})`,
    subscription_id: subscription.id,
    stripe_event_id: event.id,
  })

  // The unique stripe_event_id is the final exactly-once credit guard. Replays
  // may reach this insert after the first attempt committed it.
  if (grantError && grantError.code !== '23505') {
    throw new Error(`Minute grant failed: ${grantError.message}`)
  }
}

async function processSubscriptionChanged(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
) {
  const stripePriceId = subscriptionPriceId(subscription)
  if (!stripePriceId) {
    throw new Error(`Subscription ${subscription.id} has no Stripe Price`)
  }

  const existing = await existingSubscription(supabase, subscription.id)
  const userId = subscription.metadata?.userId ?? existing?.user_id
  if (!userId) {
    throw new Error(`Subscription ${subscription.id} has no bound Wurx user`)
  }

  const entitlement = await entitlementForPrice(supabase, stripePriceId)
  const period = periodFromSubscription(subscription)
  await upsertSubscription(supabase, {
    userId,
    stripeSubscriptionId: subscription.id,
    stripePriceId,
    planId: entitlement.plan_id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: period.current_period_start,
    currentPeriodEnd: period.current_period_end,
  })
}

async function processStripeEvent(supabase: SupabaseClient, event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await processCheckoutCompleted(
        supabase,
        event.data.object as Stripe.Checkout.Session,
      )
      return
    case 'invoice.paid':
      await processInvoicePaid(
        supabase,
        event,
        event.data.object as Stripe.Invoice,
      )
      return
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await processSubscriptionChanged(
        supabase,
        event.data.object as Stripe.Subscription,
      )
      return
    default:
      return
  }
}

export async function storeStripeEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
) {
  const { error } = await supabase.from('stripe_events').insert({
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
    status: 'pending',
  })

  if (error && error.code !== '23505') {
    throw new Error(`Could not persist Stripe event ${event.id}: ${error.message}`)
  }
}

export async function processStoredStripeEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<StripeEventProcessState> {
  const { data: payload, error: claimError } = await supabase.rpc(
    'claim_stripe_event',
    { p_event_id: eventId },
  )
  if (claimError) {
    throw new Error(`Could not claim Stripe event ${eventId}: ${claimError.message}`)
  }

  if (!payload) {
    const { data: current, error: currentError } = await supabase
      .from('stripe_events')
      .select('status')
      .eq('event_id', eventId)
      .single()
    if (currentError || !current) {
      throw new Error(`Stripe event ${eventId} is not in the durable inbox`)
    }
    return current.status === 'processed' ? 'already_processed' : 'in_progress'
  }

  try {
    await processStripeEvent(supabase, payload as unknown as Stripe.Event)

    const { data: finalized, error: processedError } = await supabase
      .from('stripe_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', eventId)
      .eq('status', 'processing')
      .select('event_id')
      .maybeSingle()

    if (processedError || !finalized) {
      throw new Error(
        `Could not finalize Stripe event: ${processedError?.message ?? 'processing claim was lost'}`,
      )
    }
    return 'processed'
  } catch (error) {
    const failure = messageOf(error).slice(0, 2000)
    const { error: failedError } = await supabase
      .from('stripe_events')
      .update({ status: 'failed', last_error: failure })
      .eq('event_id', eventId)
      .eq('status', 'processing')

    if (failedError) {
      console.error(
        `Stripe event ${eventId} failed and its failure state could not be saved:`,
        failedError.message,
      )
    }
    throw error
  }
}
