'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

/**
 * Route-level error boundary. Anything thrown while rendering a page lands
 * here instead of a blank screen — the recovery action is `reset()`, which
 * re-renders the segment without a full page load.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaces in Vercel's runtime logs, keyed by digest so a user-reported
    // error can be matched to a specific request.
    console.error('Unhandled page error', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <section className="container section">
      <div className="card empty-state" style={{ maxWidth: 520, margin: '0 auto' }}>
        <span className="icon-chip icon-chip-lg" style={{ marginBottom: 14 }}>
          <TriangleAlert size={22} />
        </span>
        <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>Something went wrong</h1>
        <p className="muted" style={{ margin: '0 0 18px' }}>
          This one is on us, not you. Try again — if it keeps happening, your
          bookings and minutes are safe and we can sort it out.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={reset}>
            <RefreshCw size={16} /> Try again
          </button>
          <Link href="/dashboard" className="btn">
            Go to dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </section>
  )
}
