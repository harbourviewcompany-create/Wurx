import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProviderProfileForm } from '@/components/ProviderProfileForm'
import { AvailabilityEditor } from '@/components/AvailabilityEditor'

export const dynamic = 'force-dynamic'

export default async function ProviderProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/provider/profile')

  const [providerRes, servicesRes] = await Promise.all([
    supabase
      .from('providers')
      .select(
        'id, business_name, bio, service_slugs, service_areas, base_postal_code, travel_radius_km',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('services').select('slug, name').eq('is_active', true).order('sort_order'),
  ])

  const provider = providerRes.data
  if (!provider) redirect('/become-a-pro')

  const { data: availability } = await supabase
    .from('provider_availability')
    .select('id, day_of_week, start_minute, end_minute')
    .eq('provider_id', provider.id)

  const { data: blackouts } = await supabase
    .from('provider_blackouts')
    .select('id, starts_at, ends_at, reason')
    .eq('provider_id', provider.id)
    .order('starts_at', { ascending: true })

  return (
    <section className="container section">
      <h1>Edit your profile</h1>
      <div style={{ maxWidth: 620 }}>
        <ProviderProfileForm provider={provider} services={servicesRes.data ?? []} />
        <div className="section">
          <h2>Weekly availability</h2>
          <p className="muted" style={{ marginTop: -8 }}>
            Jobs outside these hours won&apos;t show up for you to claim. Leave
            everything unchecked to be matched any time (not recommended).
          </p>
          <AvailabilityEditor
            providerId={provider.id}
            initialAvailability={availability ?? []}
            initialBlackouts={blackouts ?? []}
          />
        </div>
      </div>
    </section>
  )
}
