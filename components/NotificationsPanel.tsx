'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, Check, ChevronDown, ChevronUp } from 'lucide-react'
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

export function NotificationsPanel({
  initial,
  userId: userIdProp,
}: {
  initial: Notification[]
  userId?: string
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [expanded, setExpanded] = useState(false)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userIdProp ?? null)
  const unread = items.filter((item) => !item.read_at).length

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
          setItems((previous) => (previous.some((item) => item.id === row.id) ? previous : [row, ...previous]))
          setLiveIds((previous) => new Set(previous).add(row.id))
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
    const ids = items.filter((item) => !item.read_at).map((item) => item.id)
    if (ids.length === 0) return

    const now = new Date().toISOString()
    const before = items
    setItems((previous) => previous.map((item) => (item.read_at ? item : { ...item, read_at: now })))

    const supabase = createClient()
    const { error } = await supabase.from('notifications').update({ read_at: now }).in('id', ids)
    if (error) setItems(before)
  }

  if (items.length === 0) return null

  const visibleItems = expanded ? items.slice(0, 20) : items.slice(0, 3)

  return (
    <section id="activity" className="card activity-card" aria-labelledby="activity-heading">
      <div className="activity-head">
        <h2 id="activity-heading" className="card-heading" style={{ margin: 0, fontSize: 23 }}>
          <Bell size={20} aria-hidden="true" /> Activity
          {unread > 0 && <span className="tag good">{unread} new</span>}
        </h2>
        <div className="activity-actions">
          {unread > 0 && (
            <button type="button" className="btn btn-ghost" onClick={markAllRead}>
              <Check size={16} aria-hidden="true" /> Mark all read
            </button>
          )}
        </div>
      </div>

      <div id="activity-list" className="activity-list" aria-live="polite">
        {visibleItems.map((item) => {
          const isLive = liveIds.has(item.id)
          return (
            <article
              key={item.id}
              className="activity-row"
              style={{ background: isLive ? 'rgba(189, 78, 38, 0.06)' : undefined }}
            >
              <div>
                <strong style={{ fontWeight: item.read_at ? 600 : 800 }}>
                  {!item.read_at && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--brand)',
                        marginRight: 8,
                      }}
                    />
                  )}
                  {item.title}
                </strong>
                {item.body && (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
                    {item.body}
                  </p>
                )}
              </div>
              <time className="activity-time" dateTime={item.created_at}>
                {formatDateTime(item.created_at)}
              </time>
            </article>
          )
        })}
      </div>

      {items.length > 3 && (
        <button
          type="button"
          className="btn btn-ghost activity-toggle"
          aria-expanded={expanded}
          aria-controls="activity-list"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <>
              <ChevronUp size={17} aria-hidden="true" /> Show recent activity only
            </>
          ) : (
            <>
              <ChevronDown size={17} aria-hidden="true" /> View all activity ({items.length})
            </>
          )}
        </button>
      )}
    </section>
  )
}
