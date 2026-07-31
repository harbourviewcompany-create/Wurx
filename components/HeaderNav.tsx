'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function HeaderNav({
  isLoggedIn,
  isProvider,
  isAdmin,
  onSignOut,
}: {
  isLoggedIn: boolean
  isProvider: boolean
  isAdmin: boolean
  onSignOut: (formData: FormData) => void
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])

  function current(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
  }

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`nav-toggle-bar${open ? ' open' : ''}`} />
      </button>

      <nav id="site-navigation" className={`nav${open ? ' nav-open' : ''}`} aria-label="Main navigation">
        <Link href="/services" aria-current={current('/services') ? 'page' : undefined}>
          Services
        </Link>
        <Link href="/pricing" aria-current={current('/pricing') ? 'page' : undefined}>
          Plans
        </Link>
        {isLoggedIn ? (
          <>
            <Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined}>
              Home
            </Link>
            <Link
              href={isProvider ? '/provider/dashboard' : '/become-a-pro'}
              aria-current={isProvider && current('/provider') ? 'page' : undefined}
            >
              {isProvider ? 'Professional' : 'Become a pro'}
            </Link>
            {isAdmin && (
              <Link href="/admin/bookings" aria-current={current('/admin') ? 'page' : undefined}>
                Admin
              </Link>
            )}
            <form action={onSignOut}>
              <button className="btn btn-ghost" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/become-a-pro" aria-current={current('/become-a-pro') ? 'page' : undefined}>
              Become a pro
            </Link>
            <Link href="/login" aria-current={current('/login') ? 'page' : undefined}>
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Get started
            </Link>
          </>
        )}
      </nav>
    </>
  )
}
