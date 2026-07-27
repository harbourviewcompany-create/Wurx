import { createClient } from '@/lib/supabase/server'
import { formatPrice } from '@/lib/format'
import { setProviderStatus, releasePayout } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

const VERIFICATION_TAG: Record<string, string> = {
  verified: 'tag good',
  rejected: 'tag bad',
  pending: 'tag warn',
  unverified: 'tag warn',
}

const VERIFICATION_ORDER: Record<string, number> = {
  pending: 0,
  unverified: 1,
  verified: 2,
  rejected: 3,
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  // Accept date or timestamptz; date input wants YYYY-MM-DD.
  return value.slice(0, 10)
}

export default async function AdminProvidersPage() {
  const supabase = await createClient()

  const [providersRes, unpaidRes, reviewsRes] = await Promise.all([
    supabase
      .from('providers')
      .select(
        'id, business_name, verification, is_active, service_slugs, base_postal_code, rating, stripe_account_id, payouts_enabled, insurance_expires_at, background_check_at, created_at',
      )
      .order('created_at', { ascending: false }),
    supabase.from('provider_earnings').select('provider_id, net_cents').is('payout_id', null),
    supabase
      .from('reviews')
      .select('id, provider_id, rating, comment, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  const providers = [...(providersRes.data ?? [])].sort((a, b) => {
    const ao = VERIFICATION_ORDER[a.verification] ?? 9
    const bo = VERIFICATION_ORDER[b.verification] ?? 9
    if (ao !== bo) return ao - bo
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })

  const pendingCount = providers.filter((p) => p.verification === 'pending').length

  const unpaidByProvider = new Map<string, number>()
  for (const row of unpaidRes.data ?? []) {
    unpaidByProvider.set(row.provider_id, (unpaidByProvider.get(row.provider_id) ?? 0) + row.net_cents)
  }

  const reviewsByProvider = new Map<
    string,
    { id: string; rating: number; comment: string | null; created_at: string }[]
  >()
  for (const r of reviewsRes.data ?? []) {
    if (!r.provider_id) continue
    const list = reviewsByProvider.get(r.provider_id) ?? []
    list.push(r)
    reviewsByProvider.set(r.provider_id, list)
  }

  return (
    <div style={{ marginTop: 18 }}>
      {pendingCount > 0 && (
        <p className="form-note" style={{ marginBottom: 12 }}>
          <strong>{pendingCount}</strong> application{pendingCount === 1 ? '' : 's'} awaiting
          review (shown first).
        </p>
      )}

      <div className="card">
        {providers.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            No providers yet.
          </p>
        )}
        {providers.map((p) => {
          const owedCents = unpaidByProvider.get(p.id) ?? 0
          const canPay = owedCents > 0 && !!p.stripe_account_id && p.payouts_enabled
          const reviews = reviewsByProvider.get(p.id) ?? []
          const insuranceDefault = toDateInput(p.insurance_expires_at)
          const backgroundDefault = toDateInput(p.background_check_at)
          return (
            <div key={p.id} className="list-row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <strong>{p.business_name}</strong>
                <div className="muted" style={{ fontSize: 14 }}>
                  {p.service_slugs.join(', ') || 'no services'}
                  {p.base_postal_code ? ` · ${p.base_postal_code}` : ''}
                  {p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ''}
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  Owed: {formatPrice(owedCents)}
                  {!p.stripe_account_id && ' · not onboarded for payouts'}
                  {p.stripe_account_id && !p.payouts_enabled && ' · payouts not yet enabled'}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Insurance expires:{' '}
                  {p.insurance_expires_at
                    ? new Date(p.insurance_expires_at).toLocaleDateString()
                    : 'not set'}
                  {' · '}Background check:{' '}
                  {p.background_check_at
                    ? new Date(p.background_check_at).toLocaleDateString()
                    : 'not set'}
                </div>
                {reviews.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted" style={{ fontSize: 14, cursor: 'pointer' }}>
                      {reviews.length} review{reviews.length === 1 ? '' : 's'}
                    </summary>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reviews.slice(0, 10).map((r) => (
                        <div key={r.id} style={{ fontSize: 14 }}>
                          <span style={{ color: 'var(--brand)' }}>{'★'.repeat(r.rating)}</span>
                          <span className="muted">{'★'.repeat(5 - r.rating)}</span>
                          {r.comment && <span> — {r.comment}</span>}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className={VERIFICATION_TAG[p.verification] ?? 'tag'}>{p.verification}</span>
                <span className={p.is_active ? 'tag good' : 'tag bad'}>
                  {p.is_active ? 'active' : 'inactive'}
                </span>

                <form
                  action={setProviderStatus}
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}
                >
                  <input type="hidden" name="providerId" value={p.id} />
                  <input type="hidden" name="isActive" value="on" />
                  <div>
                    <label
                      htmlFor={`ins-${p.id}`}
                      className="muted"
                      style={{ fontSize: 12, display: 'block' }}
                    >
                      Insurance expires
                    </label>
                    <input
                      id={`ins-${p.id}`}
                      type="date"
                      name="insuranceExpiresAt"
                      defaultValue={insuranceDefault}
                      style={{ width: 'auto' }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`bg-${p.id}`}
                      className="muted"
                      style={{ fontSize: 12, display: 'block' }}
                    >
                      Background check
                    </label>
                    <input
                      id={`bg-${p.id}`}
                      type="date"
                      name="backgroundCheckAt"
                      defaultValue={backgroundDefault}
                      style={{ width: 'auto' }}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" name="verification" value="verified">
                    Verify
                  </button>
                  <button className="btn btn-ghost" type="submit" name="verification" value="rejected">
                    Reject
                  </button>
                </form>

                <form action={setProviderStatus} style={{ display: 'flex', gap: 6 }}>
                  <input type="hidden" name="providerId" value={p.id} />
                  <input type="hidden" name="verification" value={p.verification} />
                  {!p.is_active && <input type="hidden" name="isActive" value="on" />}
                  <button className="btn btn-ghost" type="submit">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </form>

                {canPay && (
                  <form action={releasePayout}>
                    <input type="hidden" name="providerId" value={p.id} />
                    <button className="btn btn-primary" type="submit">
                      Pay out {formatPrice(owedCents)}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
