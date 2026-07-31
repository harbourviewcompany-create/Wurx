import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RouteLoading } from '@/components/RouteLoading'

export const dynamic = 'force-dynamic'

export default async function UiStatesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  if (process.env.WURX_UI_QA !== '1') notFound()

  const { state = 'empty' } = await searchParams
  if (state === 'error') throw new Error('Wurx visual QA error state')
  if (state === 'loading') return <RouteLoading context="service workspace" />

  if (state === 'long-content') {
    return (
      <section className="container section route-state-shell" aria-labelledby="long-content-heading">
        <article className="card route-state-card">
          <p className="dashboard-kicker">Content resilience</p>
          <h1 id="long-content-heading">
            A deliberately long household service heading that must reflow without clipping at every supported width
          </h1>
          <p>
            1289-Extremely-Long-Residential-Property-Management-Crescent-Suite-1204-Ottawa-Ontario-K1A0B1
          </p>
          <p>
            This quality-assurance state verifies long names, addresses, notification messages, and service descriptions while preserving readable line length, keyboard access, and usable controls.
          </p>
          <Link href="/services" className="btn btn-primary">
            Return to services
          </Link>
        </article>
      </section>
    )
  }

  return (
    <section className="container section route-state-shell" aria-labelledby="empty-state-heading">
      <article className="card route-state-card empty-state">
        <p className="dashboard-kicker">Nothing to show</p>
        <h1 id="empty-state-heading">No matching services found</h1>
        <p>Clear the current filters or browse every available Wurx service.</p>
        <Link href="/services" className="btn btn-primary">
          Browse all services
        </Link>
      </article>
    </section>
  )
}
