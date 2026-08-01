export function RouteLoading({ context }: { context: string }) {
  return (
    <section className="container section route-state-shell" aria-labelledby="route-loading-title" aria-busy="true">
      <div className="card route-state-card" role="status" aria-live="polite">
        <span className="route-state-spinner" aria-hidden="true" />
        <div>
          <p className="dashboard-kicker">Loading</p>
          <h1 id="route-loading-title">Preparing your {context}</h1>
          <p>Wurx is retrieving the latest account, booking, and service information.</p>
        </div>
        <div className="route-state-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  )
}
