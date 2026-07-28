'use client'

/**
 * Last-resort boundary: catches errors thrown in the root layout itself,
 * where `app/error.tsx` can't render because the layout never mounted. It
 * must supply its own <html>/<body> and cannot rely on globals.css or the
 * Bricolage/DM Sans fonts loading, so colors and fonts are inlined here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
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
          <h1 style={{ fontSize: 24, marginBottom: 8, fontWeight: 800 }}>
            Wurx is having a moment
          </h1>
          <p style={{ opacity: 0.65, lineHeight: 1.6, marginBottom: 20 }}>
            The page failed to load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 4,
              border: '1px solid transparent',
              background: '#1c2b3a',
              color: '#fbfaf7',
              fontSize: 15,
              fontWeight: 700,
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
