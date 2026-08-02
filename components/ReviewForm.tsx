'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ReviewForm({ bookingId, providerId }: { bookingId: string; providerId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('reviews').insert({
      booking_id: bookingId,
      author_id: user.id,
      provider_id: providerId,
      rating,
      comment: comment.trim() || null,
    })

    setLoading(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    router.refresh()
  }

  if (!open) {
    return (
      <div style={{ width: '100%', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          Leave a review
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ width: '100%', marginTop: 8 }}>
      {error && <div className="form-error">{error}</div>}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setRating(score)}
            aria-label={`${score} star${score > 1 ? 's' : ''}`}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: score <= rating ? 'var(--brand)' : 'var(--muted, #999)',
              padding: 0,
            }}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="How did it go? (optional)"
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Submitting…' : 'Submit review'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
