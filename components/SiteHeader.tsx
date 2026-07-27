import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { HeaderNav } from '@/components/HeaderNav'

/**
 * Static header shell. The brand + nav skeleton render without any request
 * data, so pages using `revalidate` can still be prerendered. Only the
 * auth-aware nav is dynamic, and it streams in via Suspense below.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          Wur<span>x</span>
        </Link>
        <Suspense fallback={<HeaderNav isLoggedIn={false} isProvider={false} isAdmin={false} onSignOut={signOut} />}>
          <HeaderNavAuth />
        </Suspense>
      </div>
    </header>
  )
}

/**
 * Auth-dependent nav. Isolated so its cookie read only opts THIS subtree into
 * dynamic rendering — the surrounding page body stays static.
 */
async function HeaderNavAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isProvider = false
  let isAdmin = false
  if (user) {
    const [{ data: provider }, { data: profile }] = await Promise.all([
      supabase.from('providers').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
    ])
    isProvider = !!provider
    isAdmin = profile?.role === 'admin'
  }

  return <HeaderNav isLoggedIn={!!user} isProvider={isProvider} isAdmin={isAdmin} onSignOut={signOut} />
}
