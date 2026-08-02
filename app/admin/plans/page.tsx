import { createClient } from '@/lib/supabase/server'
import { formatPrice, formatMinutes } from '@/lib/format'
import { savePlan } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

type Plan = {
  id: string
  name: string
  slug: string
  description: string | null
  price_cents: number
  monthly_minutes: number
  stripe_price_id: string | null
  sort_order: number
  is_active: boolean
}

function PlanForm({ plan }: { plan?: Plan }) {
  const fieldPrefix = plan ? `plan-${plan.id}` : 'new-plan'

  return (
    <form action={savePlan} className="card" style={{ marginTop: 14 }}>
      {plan && <input type="hidden" name="id" value={plan.id} />}

      <div className="grid grid-2">
        <div>
          <label htmlFor={`${fieldPrefix}-name`}>Name</label>
          <input id={`${fieldPrefix}-name`} name="name" defaultValue={plan?.name} required />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-slug`}>Slug</label>
          <input id={`${fieldPrefix}-slug`} name="slug" defaultValue={plan?.slug} required />
        </div>
      </div>

      <label htmlFor={`${fieldPrefix}-description`}>Description</label>
      <textarea
        id={`${fieldPrefix}-description`}
        name="description"
        defaultValue={plan?.description ?? ''}
        rows={2}
      />

      <div className="grid grid-3">
        <div>
          <label htmlFor={`${fieldPrefix}-price-cents`}>Price (cents)</label>
          <input
            id={`${fieldPrefix}-price-cents`}
            name="price_cents"
            type="number"
            min={0}
            defaultValue={plan?.price_cents ?? 0}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-monthly-minutes`}>Monthly minutes</label>
          <input
            id={`${fieldPrefix}-monthly-minutes`}
            name="monthly_minutes"
            type="number"
            min={0}
            defaultValue={plan?.monthly_minutes ?? 0}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-sort-order`}>Sort order</label>
          <input
            id={`${fieldPrefix}-sort-order`}
            name="sort_order"
            type="number"
            defaultValue={plan?.sort_order ?? 0}
          />
        </div>
      </div>

      <label htmlFor={`${fieldPrefix}-stripe-price-id`}>Stripe price ID</label>
      <input
        id={`${fieldPrefix}-stripe-price-id`}
        name="stripe_price_id"
        defaultValue={plan?.stripe_price_id ?? ''}
        placeholder="price_..."
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={plan?.is_active ?? true}
          style={{ width: 'auto' }}
        />
        Active (visible on pricing page)
      </label>

      <button className="btn btn-primary" type="submit" style={{ marginTop: 14 }}>
        {plan ? 'Save changes' : 'Add plan'}
      </button>
    </form>
  )
}

export default async function AdminPlansPage() {
  const supabase = await createClient()
  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, slug, description, price_cents, monthly_minutes, stripe_price_id, sort_order, is_active')
    .order('sort_order')

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 20 }}>Add a plan</h2>
      <PlanForm />

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Existing plans</h2>
      {(plans ?? []).map((plan) => (
        <details key={plan.id} style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', padding: '10px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong>{plan.name}</strong>
            <span className="muted">
              {formatPrice(plan.price_cents)}/mo · {formatMinutes(plan.monthly_minutes)}
            </span>
            {!plan.is_active && <span className="tag warn">inactive</span>}
          </summary>
          <PlanForm plan={plan as Plan} />
        </details>
      ))}
    </div>
  )
}
