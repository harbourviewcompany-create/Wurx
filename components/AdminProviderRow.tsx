'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Provider = {
  id: string
  business_name: string
  verification: string
  is_active: boolean
  service_slugs: string[]
  base_postal_code: string | null
  rating: number | null
}

export function AdminProviderRow({ provider }: { provider: Provider }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function setStatus(verification: 'verified' | 'rejected' | 'pending', isActive: boolean) {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_provider_status', {
      p_provider_id: provider.id,
      p_verification: verification,
      p_is_active: isActive,
    })
    setLoading(false)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <div>
        <strong>{provider.business_name}</strong>
        <div className="muted" style={{ fontSize: 14 }}>
          {provider.service_slugs.join(', ') || 'no services'}
          {provider.base_postal_code ? ` · ${provider.base_postal_code}` : ''}
          {provider.rating != null ? ` · ★ ${provider.rating.toFixed(1)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className={provider.verification === 'verified' ? 'tag good' : provider.verification === 'rejected' ? 'tag bad' : 'tag warn'}>
          {provider.verification}
        </span>
        <span className={provider.is_active ? 'tag good' : 'tag bad'}>
          {provider.is_active ? 'active' : 'inactive'}
        </span>
        <button className="btn btn-primary" disabled={loading} onClick={() => setStatus('verified', true)}>
          Verify
        </button>
        <button className="btn btn-ghost" disabled={loading} onClick={() => setStatus('rejected', false)}>
          Reject
        </button>
        {provider.is_active ? (
          <button className="btn btn-ghost" disabled={loading} onClick={() => setStatus(provider.verification as 'verified' | 'rejected' | 'pending', false)}>
            Deactivate
          </button>
        ) : (
          <button className="btn btn-ghost" disabled={loading} onClick={() => setStatus(provider.verification as 'verified' | 'rejected' | 'pending', true)}>
            Activate
          </button>
        )}
      </div>
    </div>
  )
}
