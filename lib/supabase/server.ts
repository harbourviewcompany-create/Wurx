import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It bridges Supabase auth to Next's cookie store so the user's session is
 * read (and refreshed) on the server. RLS still applies to every query.
 *
 * In a Server Component the cookie store is read-only; the `setAll` no-op is
 * safe because token refresh is handled by the middleware.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a Server Component — ignore; middleware refreshes tokens.
        }
      },
    },
  })
}
