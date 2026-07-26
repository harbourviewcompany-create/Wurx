import { ImageResponse } from 'next/og'

export const alt = 'Wurx — a monthly subscription for home services in Ottawa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Link-preview card. This is the first impression in a text message or a
 * Facebook group post, which is how most of the early word of mouth travels.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px 80px',
          background: '#0b0d12',
          color: '#e8ecf4',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: 34,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #5b93ff 0%, #a98bff 100%)',
              color: '#0b0d12',
              fontSize: 36,
            }}
          >
            W
          </div>
          Wurx
        </div>

        <div
          style={{
            fontSize: 74,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            maxWidth: 900,
          }}
        >
          Your home, handled.
        </div>

        <div
          style={{
            fontSize: 34,
            lineHeight: 1.35,
            color: '#9aa4b8',
            marginTop: 26,
            maxWidth: 880,
          }}
        >
          One monthly plan. Cleaning, snow, lawn care and handyman help — booked
          in two taps with the minutes in your plan.
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 46,
            fontSize: 26,
            color: '#9aa4b8',
          }}
        >
          <span
            style={{
              padding: '10px 20px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            Vetted &amp; insured pros
          </span>
          <span
            style={{
              padding: '10px 20px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            No contracts
          </span>
          <span
            style={{
              padding: '10px 20px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            Ottawa
          </span>
        </div>
      </div>
    ),
    size,
  )
}
