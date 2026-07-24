/**
 * Centralised, validated environment access.
 *
 * Public values (safe to expose to the browser) are read from NEXT_PUBLIC_*
 * and are inlined by Next at build time, so they must be referenced statically.
 * Server-only secrets are never imported into client components.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your Vercel project settings (and .env.local for local dev).`,
    )
  }
  return value
}

// --- Public (browser-safe) -------------------------------------------------
export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

/** Absolute origin of the deployed site, e.g. https://wurx.vercel.app */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
