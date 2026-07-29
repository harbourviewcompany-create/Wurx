'use client'

import { useState } from 'react'
import { Check, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function checkPassword(password: string, confirm: string): { ok: boolean; reason: string } {
  if (password.length < 8) return { ok: false, reason: 'Use at least 8 characters.' }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, reason: 'Include at least one letter and one number.' }
  }
  if (password !== confirm) return { ok: false, reason: "The two passwords don't match." }
  return { ok: true, reason: '' }
}

/** In-account password change for a signed-in user. */
export function ChangePasswordCard() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const check = checkPassword(password, confirm)
    if (!check.ok) return setError(check.reason)

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setSaved(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
        <h3 className="card-heading" style={{ margin: 0 }}>
          <KeyRound size={18} /> Password
        </h3>
        {!open && (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
            Change
          </button>
        )}
      </div>

      {saved && (
        <p className="form-note" style={{ color: 'var(--brand)', display: 'flex', gap: 6, textAlign: 'left' }}>
          <Check size={16} /> Password updated.
        </p>
      )}

      {open && (
        <form onSubmit={onSubmit} style={{ marginTop: 8 }}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="form-note" style={{ marginTop: 10, textAlign: 'left' }}>
            At least 8 characters, with a letter and a number.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save password'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOpen(false)
                setError(null)
                setPassword('')
                setConfirm('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
