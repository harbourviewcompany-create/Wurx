import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <section className="container section">
      <div className="card empty-state" style={{ maxWidth: 520, margin: '0 auto' }}>
        <span className="icon-chip icon-chip-lg" style={{ marginBottom: 14 }}>
          <Compass size={22} />
        </span>
        <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>Page not found</h1>
        <p className="muted" style={{ margin: '0 0 18px' }}>
          The link may be old or mistyped. Here&apos;s the way back.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard/book" className="btn btn-primary">
            Browse services
          </Link>
          <Link href="/" className="btn">
            Home
          </Link>
        </div>
      </div>
    </section>
  )
}
