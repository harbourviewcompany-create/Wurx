import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background: '#fbfaf7',
          backgroundImage:
            'linear-gradient(90deg, rgba(28,43,58,0.04) 1px, transparent 1px), linear-gradient(rgba(28,43,58,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            fontWeight: 800,
            color: '#1c2b3a',
            marginBottom: 24,
          }}
        >
          Wur<span style={{ color: '#c1440e' }}>x</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 800,
            color: '#1c2b3a',
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Your home, handled — on a subscription.
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            color: '#54606c',
            marginTop: 24,
          }}
        >
          Cleaning, snow removal, lawn care, and handyman help in Ottawa.
        </div>
      </div>
    ),
    { ...size },
  )
}
