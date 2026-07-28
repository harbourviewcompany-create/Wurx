/**
 * Streamed skeleton for the dashboard. The dashboard is `force-dynamic` and
 * does several round trips before it can render, so without this the user
 * stares at a blank frame after every navigation.
 */
export default function DashboardLoading() {
  return (
    <section className="container section" aria-busy="true" aria-label="Loading your dashboard">
      <div className="skeleton skeleton-title" />
      <div className="card" style={{ marginTop: 6, display: 'flex', gap: 24, alignItems: 'center' }}>
        <div className="skeleton skeleton-ring" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="skeleton skeleton-line" style={{ width: '70%', height: 22 }} />
          <div className="skeleton skeleton-line" style={{ width: '90%' }} />
          <div className="skeleton skeleton-line" style={{ width: '40%' }} />
        </div>
      </div>
      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="skeleton skeleton-line" style={{ width: '30%' }} />
          <div className="skeleton skeleton-line" style={{ width: '60%' }} />
          <div className="skeleton skeleton-line" style={{ width: '50%' }} />
        </div>
        <div className="card">
          <div className="skeleton skeleton-line" style={{ width: '30%' }} />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton skeleton-line" style={{ width: '45%' }} />
        </div>
      </div>
    </section>
  )
}
