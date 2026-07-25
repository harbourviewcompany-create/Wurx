import { createClient } from '@/lib/supabase/server'
import { setProviderStatus } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

const VERIFICATION_TAG: Record<string, string> = {
  verified: 'tag good',
  rejected: 'tag bad',
  pending: 'tag warn',
  unverified: 'tag warn',
}

export default async function AdminProvidersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('providers')
    .select('id, business_name, verification, is_active, service_slugs, base_postal_code, rating')
    .order('created_at', { ascending: false })

  const providers = data ?? []

  return (
    <div className="card" style={{ marginTop: 18 }}>
      {providers.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No providers yet.
        </p>
      )}
      {providers.map((p) => (
        <div key={p.id} className="list-row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong>{p.business_name}</strong>
            <div className="muted" style={{ fontSize: 14 }}>
              {p.service_slugs.join(', ') || 'no services'}
              {p.base_postal_code ? ` · ${p.base_postal_code}` : ''}
              {p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={VERIFICATION_TAG[p.verification] ?? 'tag'}>{p.verification}</span>
            <span className={p.is_active ? 'tag good' : 'tag bad'}>
              {p.is_active ? 'active' : 'inactive'}
            </span>

            <form action={setProviderStatus} style={{ display: 'flex', gap: 6 }}>
              <input type="hidden" name="providerId" value={p.id} />
              <input type="hidden" name="isActive" value="on" />
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
          </div>
        </div>
      ))}
    </div>
  )
}
