'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startCheckoutSession } from '@/lib/checkout'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const priceId = params.get('priceId')
  const planSlug = params.get('plan')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

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
            ? `${window.location.origin}/auth/callback${
                priceId
                  ? `?next=${encodeURIComponent(
                      `/pricing?plan=${planSlug ?? ''}&priceId=${priceId}`,
                    )}`
                  : ''
              }`
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

    // Plan already chosen — go straight to Stripe Checkout.
    if (priceId && data.user) {
      try {
        const url = await startCheckoutSession(supabase, data.user.id, priceId)
        window.location.href = url
        return
      } catch (checkoutErr) {
        setError(
          checkoutErr instanceof Error
            ? checkoutErr.message
            : 'Account created, but checkout failed. Open Pricing to continue.',
        )
        setLoading(false)
        return
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (needsConfirm) {
    const loginHref = priceId
      ? `/login?redirect=${encodeURIComponent(
          `/pricing?plan=${planSlug ?? ''}`,
        )}&priceId=${encodeURIComponent(priceId)}${
          planSlug ? `&plan=${encodeURIComponent(planSlug)}` : ''
        }`
      : '/login'

    return (
      <div className="form">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Check your email</h2>
          <p className="muted">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            finish creating your account, then log in
            {priceId ? ' — we\'ll continue to checkout for your plan' : ''}.
          </p>
          <Link
            href={loginHref}
            className="btn btn-primary"
            style={{ marginTop: 12 }}
          >
            Go to log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="form">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Create your account</h2>
        {priceId && (
          <p className="muted" style={{ marginTop: 0 }}>
            Next step: secure checkout for your plan. Cancel anytime.
          </p>
        )}
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
            {loading
              ? priceId
                ? 'Creating account & opening checkout…'
                : 'Creating account…'
              : priceId
                ? 'Continue to checkout'
                : 'Create account'}
          </button>
        </form>
        <p className="form-note">
          Already have an account?{' '}
          <Link
            href={
              priceId
                ? `/login?redirect=${encodeURIComponent('/pricing')}&priceId=${encodeURIComponent(priceId)}${
                    planSlug ? `&plan=${encodeURIComponent(planSlug)}` : ''
                  }`
                : '/login'
            }
            style={{ color: 'var(--brand)' }}
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
