import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'

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
        <nav className="nav">
          <Link href="/services">Services</Link>
          <Link href="/pricing">Pricing</Link>
          {user ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <form action={signOut}>
                <button className="btn btn-ghost" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
