'use client'

import { useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/format'

export type Notification = {
  id: string
  kind: string
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

/**
 * In-app notification feed. Email delivery is handled separately by the
 * send-notifications edge function; this is the always-available surface so the
 * service loop never depends on an email provider being configured.
 */
export function NotificationsPanel({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial)
  const unread = items.filter((n) => !n.read_at).length

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id)
    if (ids.length === 0) return

    // Optimistic: the feed is non-critical, and RLS scopes the write to self.
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))

    const supabase = createClient()
    await supabase.from('notifications').update({ read_at: now }).in('id', ids)
  }

  if (items.length === 0) return null

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="list-row" style={{ paddingTop: 0, borderBottom: 'none' }}>
        <h3 className="card-heading" style={{ margin: 0 }}>
          <Bell size={18} /> Activity
          {unread > 0 && <span className="tag good">{unread} new</span>}
        </h3>
        {unread > 0 && (
          <button className="btn btn-ghost" onClick={markAllRead}>
            <Check size={15} /> Mark all read
          </button>
        )}
      </div>

      <div style={{ marginTop: 6 }}>
        {items.slice(0, 8).map((n) => (
          <div key={n.id} className="list-row notif-row">
            <div>
              <strong style={{ fontWeight: n.read_at ? 500 : 700 }}>
                {!n.read_at && <span className="notif-dot" aria-hidden="true" />}
                {n.title}
              </strong>
              {n.body && (
                <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
                  {n.body}
                </div>
              )}
            </div>
            <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {formatDateTime(n.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
