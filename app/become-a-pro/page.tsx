import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProviderApplyForm } from '@/components/ProviderApplyForm'

export const dynamic = 'force-dynamic'

export default async function BecomeAProPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <section className="container section">
        <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
          <h2 style={{ marginTop: 0 }}>Become a Wurx pro</h2>
          <p className="muted">
            Create an account first, then come back here to set up your
            provider profile.
          </p>
          <Link href="/signup?redirect=/become-a-pro" className="btn btn-primary">
            Create an account
          </Link>
        </div>
      </section>
    )
  }

  const { data: existing } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    redirect('/provider/dashboard')
  }

  const { data: services } = await supabase
    .from('services')
    .select('slug, name')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <section className="container section">
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1>Become a Wurx pro</h1>
        <p className="muted">
          Set up your provider profile, pick the services you offer, and start
          claiming open jobs in your area. Your profile is submitted for
          verification, but you can start claiming jobs right away.
        </p>
        <ProviderApplyForm services={services ?? []} />
      </div>
    </section>
  )
}
