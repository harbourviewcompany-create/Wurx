import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/SiteHeader'
import { SITE_URL } from '@/lib/env'

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Wurx — Subscription home services',
  description:
    'A monthly subscription for home services in Ottawa. Book cleaning, snow removal, lawn care, handyman help and more with the minutes in your plan.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${dmSans.variable}`}>
      <body>
        <SiteHeader />
        <main>{children}</main>
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
