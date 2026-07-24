'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

/**
 * Supabase client for use in Client Components (browser). Reads the public
 * URL + anon key, which are inlined at build time. Row Level Security governs
 * every query, so this client can only ever see the signed-in user's own data.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
