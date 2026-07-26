'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)

  async function resendConfirmation() {
    setError(null)
    setResending(true)
    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setResending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    setResent(true)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // If email confirmation is enabled, there is no active session yet.
    if (!data.session) {
      setNeedsConfirm(true)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (needsConfirm) {
    return (
      <div className="form">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Check your email</h2>
          <p className="muted">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            finish creating your account, then log in.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <Link href="/login" className="btn btn-primary">
              Go to log in
            </Link>
            <button
              type="button"
              className="btn"
              onClick={resendConfirmation}
              disabled={resending || resent}
            >
              {resent ? 'Email resent' : resending ? 'Sending…' : 'Resend email'}
            </button>
          </div>
          <p className="form-note">
            Nothing after a minute? Check spam, or resend — links expire after 24
            hours.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="form">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Create your account</h2>
        <form onSubmit={onSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 20 }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="form-note">
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--brand)' }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
