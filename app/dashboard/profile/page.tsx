import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CustomerProfileForm } from '@/components/CustomerProfileForm'

export const dynamic = 'force-dynamic'

export default async function CustomerProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/profile')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, address_line1, city, province, postal_code')
    .eq('id', user.id)
    .single()

  return (
    <section className="container section">
      <h1>Edit your profile</h1>
      <div style={{ maxWidth: 520 }}>
        <CustomerProfileForm
          profile={{
            full_name: profile?.full_name ?? '',
            phone: profile?.phone ?? '',
            address_line1: profile?.address_line1 ?? '',
            city: profile?.city ?? '',
            province: profile?.province ?? '',
            postal_code: profile?.postal_code ?? '',
          }}
        />
      </div>
    </section>
  )
}
