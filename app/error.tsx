'use client'

import { useEffect } from 'react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="container hero" style={{ textAlign: 'center' }}>
      <span className="eyebrow">Something went wrong</span>
      <h1>We hit a snag.</h1>
      <p className="muted" style={{ maxWidth: 480, margin: '0 auto 28px' }}>
        Give it another try. If this keeps happening, let us know.
      </p>
      <div className="cta">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <a href="/" className="btn">
          Back to home
        </a>
      </div>
    </section>
  )
}
