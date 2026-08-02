import { createClient } from '@/lib/supabase/server'
import { ServiceIcon } from '@/components/ServiceIcon'
import { saveService } from '@/app/admin/actions'

export const dynamic = 'force-dynamic'

type Service = {
  id: string
  name: string
  slug: string
  icon: string | null
  description: string | null
  default_duration_minutes: number
  credit_multiplier: number
  provider_rate_cents_per_hour: number | null
  requires_licensed_provider: boolean
  sort_order: number
  is_active: boolean
}

function ServiceForm({ service }: { service?: Service }) {
  const fieldPrefix = service ? `service-${service.id}` : 'new-service'

  return (
    <form action={saveService} className="card" style={{ marginTop: 14 }}>
      {service && <input type="hidden" name="id" value={service.id} />}

      <div className="grid grid-2">
        <div>
          <label htmlFor={`${fieldPrefix}-name`}>Name</label>
          <input id={`${fieldPrefix}-name`} name="name" defaultValue={service?.name} required />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-slug`}>Slug</label>
          <input id={`${fieldPrefix}-slug`} name="slug" defaultValue={service?.slug} required />
        </div>
      </div>

      <div className="grid grid-2">
        <div>
          <label htmlFor={`${fieldPrefix}-icon`}>
            Icon (lucide name: sparkles, snowflake, leaf, wrench, trash, home)
          </label>
          <input id={`${fieldPrefix}-icon`} name="icon" defaultValue={service?.icon ?? ''} />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-sort-order`}>Sort order</label>
          <input
            id={`${fieldPrefix}-sort-order`}
            name="sort_order"
            type="number"
            defaultValue={service?.sort_order ?? 0}
          />
        </div>
      </div>

      <label htmlFor={`${fieldPrefix}-description`}>Description</label>
      <textarea
        id={`${fieldPrefix}-description`}
        name="description"
        defaultValue={service?.description ?? ''}
        rows={2}
      />

      <div className="grid grid-3">
        <div>
          <label htmlFor={`${fieldPrefix}-duration`}>Default duration (minutes)</label>
          <input
            id={`${fieldPrefix}-duration`}
            name="default_duration_minutes"
            type="number"
            min={15}
            step={15}
            defaultValue={service?.default_duration_minutes ?? 60}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-multiplier`}>Credit multiplier</label>
          <input
            id={`${fieldPrefix}-multiplier`}
            name="credit_multiplier"
            type="number"
            step="0.1"
            min={0}
            defaultValue={service?.credit_multiplier ?? 1}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-provider-rate`}>Provider rate (¢/hr)</label>
          <input
            id={`${fieldPrefix}-provider-rate`}
            name="provider_rate_cents_per_hour"
            type="number"
            defaultValue={service?.provider_rate_cents_per_hour ?? ''}
          />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          name="requires_licensed_provider"
          defaultChecked={service?.requires_licensed_provider}
          style={{ width: 'auto' }}
        />
        Requires licensed provider
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={service?.is_active ?? true}
          style={{ width: 'auto' }}
        />
        Active (visible to customers)
      </label>

      <button className="btn btn-primary" type="submit" style={{ marginTop: 14 }}>
        {service ? 'Save changes' : 'Add service'}
      </button>
    </form>
  )
}

export default async function AdminServicesPage() {
  const supabase = await createClient()
  const { data: services } = await supabase
    .from('services')
    .select(
      'id, name, slug, icon, description, default_duration_minutes, credit_multiplier, provider_rate_cents_per_hour, requires_licensed_provider, sort_order, is_active',
    )
    .order('sort_order')

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 20 }}>Add a service</h2>
      <ServiceForm />

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Existing services</h2>
      {(services ?? []).map((service) => (
        <details key={service.id} style={{ marginTop: 10 }}>
          <summary className="card-heading" style={{ cursor: 'pointer', padding: '10px 0' }}>
            <ServiceIcon name={service.icon} />
            {service.name}
            {!service.is_active && <span className="tag warn">inactive</span>}
          </summary>
          <ServiceForm service={service as Service} />
        </details>
      ))}
    </div>
  )
}
