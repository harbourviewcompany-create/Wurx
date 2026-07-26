/** Streamed skeleton for the service catalogue: search bar, chips, card grid. */
export default function BookLoading() {
  return (
    <section className="container section" aria-busy="true" aria-label="Loading services">
      <div className="skeleton skeleton-title" />
      <div className="skeleton" style={{ height: 52, borderRadius: 14, marginTop: 18 }} />
      <div className="chip-row" style={{ marginTop: 14 }}>
        <div className="skeleton" style={{ height: 34, width: 110, borderRadius: 999 }} />
        <div className="skeleton" style={{ height: 34, width: 104, borderRadius: 999 }} />
        <div className="skeleton" style={{ height: 34, width: 118, borderRadius: 999 }} />
      </div>
      <div className="service-grid" style={{ marginTop: 20 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card">
            <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 12 }} />
            <div className="skeleton skeleton-line" style={{ width: '55%', height: 18 }} />
            <div className="skeleton skeleton-line" style={{ width: '90%' }} />
            <div className="skeleton skeleton-line" style={{ width: '35%' }} />
          </div>
        ))}
      </div>
    </section>
  )
}
