'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

/**
 * Supabase client for use in Client Components (browser). Reads the public
 * URL + anon key, which are inlined at build time. Row Level Security governs
 * every query, so this client can only ever see the signed-in user's own data.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
}
