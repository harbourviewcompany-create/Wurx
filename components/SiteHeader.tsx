import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { HeaderNav } from '@/components/HeaderNav'

export async function SiteHeader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          Wur<span>x</span>
        </Link>
        <HeaderNav isLoggedIn={!!user} onSignOut={signOut} />
      </div>
    </header>
  )
}
