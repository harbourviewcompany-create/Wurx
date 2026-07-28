'use client'

/**
 * Last-resort boundary: errors in the root layout itself, where `app/error.tsx`
 * cannot render. Must supply its own html/body and cannot depend on globals.css.
 * Colors aligned with Option A (navy ink, off-white, burnt orange).
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
          background: '#fbfaf7',
          color: '#1c2b3a',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#c1440e',
            }}
          >
            Wurx
          </p>
          <h1 style={{ fontSize: 24, margin: '0 0 8px', fontWeight: 800 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#54606c', lineHeight: 1.6, marginBottom: 20 }}>
            The page failed to load. Reloading usually fixes it — your bookings
            and minutes are safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '12px 20px',
              borderRadius: 4,
              border: 'none',
              background: '#1c2b3a',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ color: '#7c8791', fontSize: 12, marginTop: 18 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
