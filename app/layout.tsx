import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/SiteHeader'
import { SITE_URL } from '@/lib/env'

const DESCRIPTION =
  'A monthly subscription for home services in Ottawa. Book cleaning, snow removal, lawn care, handyman help and more with the minutes in your plan.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Wurx — Subscription home services',
    // Page titles that don't set their own get the brand appended.
    template: '%s — Wurx',
  },
  description: DESCRIPTION,
  applicationName: 'Wurx',
  keywords: [
    'home services Ottawa',
    'house cleaning subscription',
    'snow removal Ottawa',
    'lawn care Ottawa',
    'handyman Ottawa',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Wurx',
    locale: 'en_CA',
    url: SITE_URL,
    title: 'Wurx — Your home, handled.',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wurx — Your home, handled.',
    description: DESCRIPTION,
  },
  appleWebApp: { capable: true, title: 'Wurx', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container inner" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span>© {new Date().getFullYear()} Wurx · Ottawa home services</span>
            <span style={{ display: 'flex', gap: 16 }}>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  )
}
