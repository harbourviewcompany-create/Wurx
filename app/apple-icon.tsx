import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** iOS home-screen icon. iOS masks the corners itself, so this stays square. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #5b93ff 0%, #a98bff 100%)',
          color: '#0b0d12',
          fontSize: 108,
          fontWeight: 800,
          letterSpacing: '-0.06em',
        }}
      >
        W
      </div>
    ),
    size,
  )
}
