import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <section className="container section">
      <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
      </div>
      <nav className="admin-nav">
        <Link href="/admin/bookings">Bookings</Link>
        <Link href="/admin/providers">Providers</Link>
        <Link href="/admin/services">Services</Link>
        <Link href="/admin/plans">Plans</Link>
        <Link href="/admin/users">Users</Link>
      </nav>
      {children}
    </section>
  )
}
