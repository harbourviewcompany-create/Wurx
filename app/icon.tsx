import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/** Generated app icon — the wordmark's W on the brand gradient. */
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
          background: 'linear-gradient(135deg, #5b93ff 0%, #a98bff 100%)',
          color: '#0b0d12',
          fontSize: 300,
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
