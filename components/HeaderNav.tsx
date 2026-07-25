'use client'

import { useState } from 'react'
import Link from 'next/link'

export function HeaderNav({
  isLoggedIn,
  isAdmin,
  onSignOut,
}: {
  isLoggedIn: boolean
  isAdmin: boolean
  onSignOut: (formData: FormData) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`nav-toggle-bar${open ? ' open' : ''}`} />
      </button>

      <nav className={`nav${open ? ' nav-open' : ''}`}>
        <Link href="/services" onClick={() => setOpen(false)}>
          Services
        </Link>
        <Link href="/pricing" onClick={() => setOpen(false)}>
          Pricing
        </Link>
        {isLoggedIn ? (
          <>
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            {isAdmin && (
              <Link href="/admin/bookings" onClick={() => setOpen(false)}>
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
            <Link href="/login" onClick={() => setOpen(false)}>
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary" onClick={() => setOpen(false)}>
              Get started
            </Link>
          </>
        )}
      </nav>
    </>
  )
}
