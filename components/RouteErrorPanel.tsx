'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

export function RouteErrorPanel({
  error,
  reset,
  context,
}: {
  error: Error & { digest?: string }
  reset: () => void
  context: string
}) {
  return (
    <section className="container section route-state-shell" aria-labelledby="route-error-title">
      <div className="card route-state-card route-state-error" role="alert">
        <AlertTriangle size={28} aria-hidden="true" />
        <div>
          <p className="dashboard-kicker">Unable to load</p>
          <h1 id="route-error-title">Your {context} could not be prepared</h1>
          <p>
            No changes were made. Try again, and contact Wurx support if the problem continues
            {error.digest ? ` (reference ${error.digest})` : ''}.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={reset}>
          <RotateCcw size={18} aria-hidden="true" />
          Try again
        </button>
      </div>
    </section>
  )
}
