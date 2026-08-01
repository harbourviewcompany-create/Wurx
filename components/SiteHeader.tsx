import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { HeaderNav } from '@/components/HeaderNav'
import { MobileBottomNav } from '@/components/MobileBottomNav'

export async function SiteHeader() {
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

  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link href={user ? '/dashboard' : '/'} className="brand" aria-label="Wurx home">
            Wur<span>x</span>
          </Link>
          <HeaderNav
            isLoggedIn={!!user}
            isProvider={isProvider}
            isAdmin={isAdmin}
            onSignOut={signOut}
          />
        </div>
      </header>
      {user && <MobileBottomNav isProvider={isProvider} />}
    </>
  )
}
