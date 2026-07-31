import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Build signup URL that carries the chosen Stripe price (and optional plan slug)
 * through account creation into checkout.
 */
export function signupUrlForPlan(priceId: string, planSlug?: string | null) {
  const q = new URLSearchParams()
  q.set('priceId', priceId)
  if (planSlug) q.set('plan', planSlug)
  return `/signup?${q.toString()}`
}

/**
 * Build login URL that returns the user to pricing and auto-starts checkout
 * for the selected price after sign-in.
 */
export function loginUrlForPlan(priceId: string, planSlug?: string | null) {
  const q = new URLSearchParams()
  q.set('redirect', planSlug ? `/pricing?plan=${encodeURIComponent(planSlug)}` : '/pricing')
  q.set('priceId', priceId)
  if (planSlug) q.set('plan', planSlug)
  return `/login?${q.toString()}`
}

/**
 * Invoke create-checkout for the current signed-in user. The Edge Function
 * derives that user exclusively from the verified JWT; the browser sends only
 * the selected Stripe price id.
 */
export async function startCheckoutSession(
  supabase: SupabaseClient,
  priceId: string,
): Promise<string> {
  const { data, error: fnError } = await supabase.functions.invoke<{
    url?: string
    error?: string
  }>('create-checkout', {
    body: { priceId },
  })

  if (fnError) throw new Error(fnError.message)
  if (data?.error) throw new Error(data.error)
  if (!data?.url) throw new Error('No checkout URL returned.')
  return data.url
}
