'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
 *
 * Rows arrive over Realtime as booking triggers write them, so a customer
 * watching this page sees "a pro claimed your job" without refreshing.
 * RLS filters the stream server-side — a subscriber only ever receives rows
 * where `user_id = auth.uid()`.
 *
 * `userId` is optional: when omitted, the panel reads the signed-in user from
 * the browser client so call sites do not need to change.
 */
export function NotificationsPanel({
  initial,
  userId: userIdProp,
}: {
  initial: Notification[]
  userId?: string
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userIdProp ?? null)
  const unread = items.filter((n) => !n.read_at).length

  useEffect(() => {
    if (userIdProp) {
      setResolvedUserId(userIdProp)
      return
    }
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setResolvedUserId(data.user.id)
    })
  }, [userIdProp])

  // Adopt the server's list whenever the page re-renders with fresh data.
  const initialRef = useRef(initial)
  useEffect(() => {
    if (initial !== initialRef.current) {
      initialRef.current = initial
      setItems(initial)
    }
  }, [initial])

  useEffect(() => {
    if (!resolvedUserId) return

    const supabase = createClient()
    let poll: ReturnType<typeof setInterval> | undefined

    // If Realtime can't be reached — disabled on the project, a proxy that
    // blocks WebSockets, a flaky network — fall back to a slow refresh so the
    // feed still catches up instead of going stale silently.
    function startPolling() {
      if (poll) return
      poll = setInterval(() => router.refresh(), 60_000)
    }

    const channel = supabase
      .channel(`notifications:${resolvedUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${resolvedUserId}`,
        },
        (payload) => {
          const row = payload.new as Notification
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]))
          setLiveIds((prev) => new Set(prev).add(row.id))
          // Booking state changed — pull fresh bookings list and minute balance.
          router.refresh()
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling()
        }
      })

    return () => {
      if (poll) clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [resolvedUserId, router])

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
          <button type="button" className="btn btn-ghost" onClick={markAllRead}>
            <Check size={15} /> Mark all read
          </button>
        )}
      </div>

      <div style={{ marginTop: 6 }} aria-live="polite">
        {items.slice(0, 8).map((n) => (
          <div
            key={n.id}
            className={`list-row notif-row${liveIds.has(n.id) ? ' notif-new' : ''}`}
          >
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
