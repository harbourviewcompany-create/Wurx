'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { checkPassword } from '@/lib/profile'

type Ready = 'checking' | 'ready' | 'no-session'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState<Ready>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // The recovery link lands on /auth/callback, which exchanges the one-time
  // code for a session and forwards here. No session means the link was already
  // used, expired, or the page was opened directly.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setReady(data.user ? 'ready' : 'no-session')
    })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const check = checkPassword(password, confirm)
    if (!check.ok) return setError(check.reason)

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (ready === 'checking') {
    return (
      <div className="form">
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Checking your link…
          </p>
        </div>
      </div>
    )
  }

  if (ready === 'no-session') {
    return (
      <div className="form">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>That link has expired</h2>
          <p className="muted">
            Password links work once and expire after an hour. Request a fresh one
            and we&apos;ll email it right away.
          </p>
          <Link href="/forgot-password" className="btn btn-primary" style={{ marginTop: 12 }}>
            Send a new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="form">
      <div className="card">
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <KeyRound size={22} /> Choose a new password
        </h2>
        <form onSubmit={onSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="form-note" style={{ marginTop: 10 }}>
            At least 8 characters, with a letter and a number.
          </p>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 12 }}
          >
            {loading ? 'Saving…' : 'Save password and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
