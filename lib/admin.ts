import { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolves the current user and their profile role from a server client.
 * Shared by the admin layout (which redirects on failure) and admin server
 * actions (which throw), so the auth check lives in exactly one place.
 */
async function resolveAdmin(supabase: ServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { user, role: profile?.role ?? null }
}

/**
 * For Server Actions. Returns an admin-scoped client or throws — RLS on the
 * database is still the real gate; this is a fast, friendly pre-check.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { user, role } = await resolveAdmin(supabase)
  if (!user) throw new Error('Not authenticated')
  if (role !== 'admin') throw new Error('Not authorized')
  return supabase
}

/**
 * For the admin layout/pages. Returns the destination to redirect to when the
 * visitor isn't an admin, or null when access is allowed.
 */
export async function adminRedirectTarget(): Promise<string | null> {
  const supabase = await createClient()
  const { user, role } = await resolveAdmin(supabase)
  if (!user) return '/login?redirect=/admin'
  if (role !== 'admin') return '/dashboard'
  return null
}
