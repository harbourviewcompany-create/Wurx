'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    // Always report success — telling a stranger whether an address exists
    // here would leak account existence.
    setSent(true)
  }

  if (sent) {
    return (
      <div className="form">
        <div className="card">
          <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MailCheck size={22} /> Check your email
          </h2>
          <p className="muted">
            If an account exists for <strong>{email}</strong>, a link to set a new
            password is on its way. The link works once and expires in an hour.
          </p>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 12 }}>
            Back to log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="form">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Reset your password</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Enter the email you signed up with and we&apos;ll send you a link.
        </p>
        <form onSubmit={onSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 20 }}
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="form-note">
          Remembered it?{' '}
          <Link href="/login" style={{ color: 'var(--brand)' }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
