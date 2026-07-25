import type { Metadata } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/SiteHeader'

export const metadata: Metadata = {
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
    <html lang="en">
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
