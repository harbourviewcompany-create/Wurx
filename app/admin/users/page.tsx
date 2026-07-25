import { createClient } from '@/lib/supabase/server'
import { formatMinutes } from '@/lib/format'
import { setUserRole, grantMinutes } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

const ROLES = ['customer', 'provider', 'admin']

const ROLE_TAG: Record<string, string> = {
  admin: 'tag good',
  provider: 'tag',
  customer: 'tag',
}

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const [profilesRes, balancesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('available_balances').select('user_id, available_minutes'),
  ])

  const profiles = profilesRes.data ?? []
  const balanceByUser = new Map((balancesRes.data ?? []).map((b) => [b.user_id, b.available_minutes ?? 0]))

  return (
    <div className="card" style={{ marginTop: 18 }}>
      {profiles.map((p) => (
        <div key={p.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 200 }}>
            <strong>{p.full_name ?? 'No name'}</strong>
            <div className="muted" style={{ fontSize: 14 }}>
              {p.email}
            </div>
            <div className="muted" style={{ fontSize: 14 }}>
              {formatMinutes(balanceByUser.get(p.id) ?? 0)} available
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={ROLE_TAG[p.role] ?? 'tag'}>{p.role}</span>

            <form action={setUserRole} style={{ display: 'flex', gap: 6 }}>
              <input type="hidden" name="userId" value={p.id} />
              <select name="role" defaultValue={p.role} style={{ width: 'auto' }}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button className="btn" type="submit">
                Save
              </button>
            </form>

            <form action={grantMinutes} style={{ display: 'flex', gap: 6 }}>
              <input type="hidden" name="userId" value={p.id} />
              <input
                type="number"
                name="minutes"
                placeholder="± minutes"
                style={{ width: 100 }}
                required
              />
              <button className="btn" type="submit">
                Adjust
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  )
}
