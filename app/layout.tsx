import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
import './globals.css'
import './wurx-ui.css'
import './wurx-provider.css'
import './wurx-states.css'
import './wurx-release-fixes.css'
import { SiteHeader } from '@/components/SiteHeader'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['500', '700', '800'],
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dmsans',
  weight: ['400', '500', '700'],
  display: 'swap',
})

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wurx.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: 'Wurx — Subscription home services',
  description:
    'A monthly subscription for home services in Ottawa. Book cleaning, snow removal, lawn care, handyman help and more with the time in your plan.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f4ec',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${dmSans.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          <div className="container inner">
            <span>© {new Date().getFullYear()} Wurx · Ottawa home services</span>
            <span className="footer-links">
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  )
}
