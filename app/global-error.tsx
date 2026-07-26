'use client'

/**
 * Last-resort boundary: catches errors thrown in the root layout itself, where
 * `app/error.tsx` can't render because the layout never mounted. It must supply
 * its own <html>/<body>, and cannot rely on the design system loading.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0d12',
          color: '#e8ecf4',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Wurx is having a moment</h1>
          <p style={{ opacity: 0.7, lineHeight: 1.6, marginBottom: 20 }}>
            The page failed to load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.16)',
              background: '#5b93ff',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ opacity: 0.45, fontSize: 12, marginTop: 18 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
