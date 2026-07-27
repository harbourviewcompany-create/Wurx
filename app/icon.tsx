import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1c2b3a',
          borderRadius: 6,
          fontSize: 22,
          fontWeight: 800,
          color: '#fbfaf7',
        }}
      >
        W<span style={{ color: '#c1440e' }}>x</span>
      </div>
    ),
    { ...size },
  )
}
