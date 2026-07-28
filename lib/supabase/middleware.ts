import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/database.types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = ['/dashboard', '/provider/dashboard', '/admin']

/**
 * Refreshes the Supabase auth token on every request and guards protected
 * routes. Must run in proxy so refreshed cookies are written to the
 * response before the page renders.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() revalidates the token with Supabase — do not replace
  // with getSession(), which trusts unverified cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Signed-in customers never land on marketing home — go straight to book.
  if (user && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard/book'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  if (needsAuth && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return response
}
