'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from '@stripe/react-connect-js'
import { createClient } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'

/**
 * Stripe Connect embedded account onboarding — pros complete KYC / bank
 * setup without leaving Wurx.
 */
export function EmbeddedPayoutOnboarding({
  onComplete,
  onCancel,
}: {
  onComplete: () => void
  onCancel?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [connectInstance, setConnectInstance] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null)

  const fetchClientSecret = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fnError } = await supabase.functions.invoke<{
      clientSecret?: string
      error?: string
    }>('provider-payouts', { body: { action: 'account_session' } })

    if (fnError) {
      let message = fnError.message
      if (fnError instanceof FunctionsHttpError) {
        const body = await fnError.context.json().catch(() => null)
        if (body?.error) message = body.error
      }
      setError(message)
      throw new Error(message)
    }
    if (data?.error) {
      setError(data.error)
      throw new Error(data.error)
    }
    if (!data?.clientSecret) {
      const message = 'Could not start payout setup.'
      setError(message)
      throw new Error(message)
    }
    return data.clientSecret
  }, [])

  useEffect(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!pk) {
      setError(
        'Payout setup is not fully configured yet. Please contact support.',
      )
      return
    }

    try {
      const instance = loadConnectAndInitialize({
        publishableKey: pk,
        fetchClientSecret,
        appearance: {
          overlays: 'dialog',
          variables: {
            colorPrimary: '#0d9488',
            colorBackground: '#ffffff',
            colorText: '#0f172a',
            borderRadius: '10px',
          },
        },
      })
      setConnectInstance(instance)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payout setup.')
    }
  }, [fetchClientSecret])

  async function handleExit() {
    try {
      const supabase = createClient()
      await supabase.functions.invoke('provider-payouts', {
        body: { action: 'status' },
      })
    } catch {
      // Non-fatal — dashboard refresh still picks up state
    }
    onComplete()
  }

  if (error) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          {error}
        </p>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel} style={{ marginTop: 12 }}>
            Close
          </button>
        )}
      </div>
    )
  }

  if (!connectInstance) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          Loading secure payout setup…
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: 16 }}>
      <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none', marginBottom: 8 }}>
        <h3 className="card-heading" style={{ margin: 0 }}>
          Set up payouts
        </h3>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        Enter your details below. This stays on Wurx — powered by Stripe for
        security and bank connections.
      </p>
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding
          onExit={handleExit}
          onLoadError={({ error: loadError }) => {
            setError(
              loadError?.message ??
                'Could not load secure payout setup. Please try again.',
            )
          }}
        />
      </ConnectComponentsProvider>
    </div>
  )
}
