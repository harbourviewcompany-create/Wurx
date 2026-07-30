import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format'
import { CustomerProfileForm } from '@/components/CustomerProfileForm'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { ManageSubscriptionButton } from '@/components/ManageSubscriptionButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your profile — Wurx',
}

const ACTIVE_SUB_STATUSES = ['trialing', 'active', 'past_due']

export default async function CustomerProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/profile')

  const [profileRes, subRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, phone, address_line1, city, province, postal_code')
      .eq('id', user.id)
      .single(),
    supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end, plans(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const profile = profileRes.data
  const sub = subRes.data
  const plan = (sub?.plans ?? null) as { name: string } | null
  const hasActiveSub = !!sub && ACTIVE_SUB_STATUSES.includes(sub.status)

  return (
    <section className="container section" style={{ maxWidth: 640 }}>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={16} /> Dashboard
      </Link>

      <h1 style={{ marginBottom: 4 }}>Your profile</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Saved here once, filled in for every booking.
      </p>

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

      <div className="card" style={{ marginTop: 18 }}>
        <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
          <h3 className="card-heading" style={{ margin: 0 }}>
            <CreditCard size={18} /> Plan
          </h3>
          {hasActiveSub && <ManageSubscriptionButton />}
        </div>

        {hasActiveSub ? (
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {plan?.name ?? 'Your plan'} · {sub?.cancel_at_period_end ? 'ends' : 'renews'}{' '}
            {sub?.current_period_end ? formatDateTime(sub.current_period_end) : '—'}
          </p>
        ) : (
          <>
            <p className="muted" style={{ margin: '4px 0 12px' }}>
              You don't have an active plan yet.
            </p>
            <Link href="/pricing" className="btn btn-primary">
              Choose a plan
            </Link>
          </>
        )}
      </div>

      <ChangePasswordCard />
    </section>
  )
}
