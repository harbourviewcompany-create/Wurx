'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function CompleteBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  async function complete() {
    setError(null)
    setLoading(true)
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Session expired — log in again.')
      setLoading(false)
      return
    }

    // Optional after-photos (best-effort; completion still runs if upload fails)
    for (const file of files.slice(0, 4)) {
      const path = `${bookingId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('job-photos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (!upErr) {
        await supabase.from('booking_photos').insert({
          booking_id: bookingId,
          uploaded_by: user.id,
          storage_path: path,
          caption: 'After',
        })
      }
    }

    const { error: rpcError } = await supabase.rpc('complete_booking', {
      p_booking_id: bookingId,
    })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        Mark complete
      </button>
    )
  }

  return (
    <div className="card" style={{ marginTop: 10, width: '100%' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Finish the job</p>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
        Optional: add after photos so the customer sees the result. Then settle their plan time.
      </p>
      {error && <div className="form-error">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
      />
      <button
        type="button"
        className="btn"
        onClick={() => inputRef.current?.click()}
        style={{ width: '100%', marginBottom: 10 }}
      >
        <Camera size={16} /> {files.length ? `${files.length} photo(s) selected` : 'Add after photos'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={complete}>
          {loading ? 'Completing…' : 'Complete & settle'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
