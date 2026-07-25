'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return supabase
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export async function setBookingStatus(formData: FormData) {
  const supabase = await requireAdmin()
  const bookingId = String(formData.get('bookingId'))
  const status = String(formData.get('status'))

  if (status === 'cancelled') {
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
    if (error) throw new Error(error.message)
  } else if (status === 'completed') {
    const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId })
    if (error) throw new Error(error.message)
  } else {
    // requested / confirmed / in_progress don't touch minutes, so a plain
    // update under the admin RLS policy is enough — no RPC needed.
    const { error } = await supabase
      .from('bookings')
      .update({ status: status as 'requested' | 'confirmed' | 'in_progress' })
      .eq('id', bookingId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/bookings')
}

export async function assignProvider(formData: FormData) {
  const supabase = await requireAdmin()
  const bookingId = String(formData.get('bookingId'))
  const providerId = String(formData.get('providerId') || '')

  const { error } = await supabase
    .from('bookings')
    .update({ provider_id: providerId || null })
    .eq('id', bookingId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/bookings')
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function saveService(formData: FormData) {
  const supabase = await requireAdmin()
  const id = String(formData.get('id') || '')

  const row = {
    name: String(formData.get('name')),
    slug: String(formData.get('slug')),
    icon: String(formData.get('icon') || '') || null,
    description: String(formData.get('description') || '') || null,
    default_duration_minutes: Number(formData.get('default_duration_minutes')),
    credit_multiplier: Number(formData.get('credit_multiplier')),
    provider_rate_cents_per_hour: formData.get('provider_rate_cents_per_hour')
      ? Number(formData.get('provider_rate_cents_per_hour'))
      : null,
    requires_licensed_provider: formData.get('requires_licensed_provider') === 'on',
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: formData.get('is_active') === 'on',
  }

  const { error } = id
    ? await supabase.from('services').update(row).eq('id', id)
    : await supabase.from('services').insert(row)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/services')
  revalidatePath('/services')
  revalidatePath('/')
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function savePlan(formData: FormData) {
  const supabase = await requireAdmin()
  const id = String(formData.get('id') || '')

  const row = {
    name: String(formData.get('name')),
    slug: String(formData.get('slug')),
    description: String(formData.get('description') || '') || null,
    price_cents: Number(formData.get('price_cents')),
    monthly_minutes: Number(formData.get('monthly_minutes')),
    stripe_price_id: String(formData.get('stripe_price_id') || '') || null,
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: formData.get('is_active') === 'on',
  }

  const { error } = id
    ? await supabase.from('plans').update(row).eq('id', id)
    : await supabase.from('plans').insert(row)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/plans')
  revalidatePath('/pricing')
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function setUserRole(formData: FormData) {
  const supabase = await requireAdmin()
  const userId = String(formData.get('userId'))
  const role = String(formData.get('role'))

  const { error } = await supabase
    .from('profiles')
    .update({ role: role as 'customer' | 'provider' | 'admin' })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/users')
}

export async function grantMinutes(formData: FormData) {
  const supabase = await requireAdmin()
  const userId = String(formData.get('userId'))
  const minutes = Number(formData.get('minutes'))
  const description = String(formData.get('description') || 'Manual admin grant')

  if (!Number.isFinite(minutes) || minutes === 0) {
    throw new Error('Enter a non-zero number of minutes')
  }

  const { error } = await supabase.from('hour_ledger').insert({
    user_id: userId,
    delta_minutes: minutes,
    entry_type: 'adjustment',
    description,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/users')
}
