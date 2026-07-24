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
          <div className="container">
            © {new Date().getFullYear()} Wurx · Ottawa home services
          </div>
        </footer>
      </body>
    </html>
  )
}
