import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { HeaderNav } from '@/components/HeaderNav'

export async function SiteHeader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isProvider = false
  if (user) {
    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    isProvider = !!provider
  }

  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          Wur<span>x</span>
        </Link>
        <HeaderNav isLoggedIn={!!user} isProvider={isProvider} onSignOut={signOut} />
      </div>
    </header>
  )
}
