import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="container hero" style={{ textAlign: 'center' }}>
      <span className="eyebrow">404</span>
      <h1>This page wandered off the job site.</h1>
      <p className="muted" style={{ maxWidth: 480, margin: '0 auto 28px' }}>
        The page you&apos;re looking for doesn&apos;t exist, or it moved.
      </p>
      <div className="cta">
        <Link href="/" className="btn btn-primary">
          Back to home
        </Link>
        <Link href="/services" className="btn">
          Browse services
        </Link>
      </div>
    </section>
  )
}
