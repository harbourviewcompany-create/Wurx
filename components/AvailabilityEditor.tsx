'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function timeToMinutes(time: string) {
  const [hStr, mStr] = time.split(':')
  return Number(hStr ?? 0) * 60 + Number(mStr ?? 0)
}

type Availability = { id: string; day_of_week: number; start_minute: number; end_minute: number }
type Blackout = { id: string; starts_at: string; ends_at: string; reason: string | null }

export function AvailabilityEditor({
  providerId,
  initialAvailability,
  initialBlackouts,
}: {
  providerId: string
  initialAvailability: Availability[]
  initialBlackouts: Blackout[]
}) {
  const router = useRouter()
  const existingDays = new Set(initialAvailability.map((a) => a.day_of_week))
  const [selectedDays, setSelectedDays] = useState<Set<number>>(existingDays)
  const firstAvailability = initialAvailability[0]
  const [startTime, setStartTime] = useState(
    firstAvailability ? minutesToTime(firstAvailability.start_minute) : '09:00',
  )
  const [endTime, setEndTime] = useState(
    firstAvailability ? minutesToTime(firstAvailability.end_minute) : '17:00',
  )
  const [savingHours, setSavingHours] = useState(false)
  const [hoursError, setHoursError] = useState<string | null>(null)

  const [blackouts, setBlackouts] = useState(initialBlackouts)
  const [boStart, setBoStart] = useState('')
  const [boEnd, setBoEnd] = useState('')
  const [boReason, setBoReason] = useState('')
  const [savingBo, setSavingBo] = useState(false)
  const [boError, setBoError] = useState<string | null>(null)

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  async function saveHours() {
    setHoursError(null)
    const startMinute = timeToMinutes(startTime)
    const endMinute = timeToMinutes(endTime)
    if (endMinute <= startMinute) {
      setHoursError('End time must be after start time.')
      return
    }

    setSavingHours(true)
    const supabase = createClient()

    const { error: deleteError } = await supabase
      .from('provider_availability')
      .delete()
      .eq('provider_id', providerId)

    if (deleteError) {
      setHoursError(deleteError.message)
      setSavingHours(false)
      return
    }

    if (selectedDays.size > 0) {
      const rows = Array.from(selectedDays).map((day) => ({
        provider_id: providerId,
        day_of_week: day,
        start_minute: startMinute,
        end_minute: endMinute,
      }))
      const { error: insertError } = await supabase.from('provider_availability').insert(rows)
      if (insertError) {
        setHoursError(insertError.message)
        setSavingHours(false)
        return
      }
    }

    setSavingHours(false)
    router.refresh()
  }

  async function addBlackout() {
    setBoError(null)
    if (!boStart || !boEnd) {
      setBoError('Start and end are required.')
      return
    }
    if (new Date(boEnd).getTime() <= new Date(boStart).getTime()) {
      setBoError('End must be after start.')
      return
    }

    setSavingBo(true)
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('provider_blackouts')
      .insert({
        provider_id: providerId,
        starts_at: new Date(boStart).toISOString(),
        ends_at: new Date(boEnd).toISOString(),
        reason: boReason.trim() || null,
      })
      .select('id, starts_at, ends_at, reason')
      .single()

    setSavingBo(false)
    if (insertError) {
      setBoError(insertError.message)
      return
    }
    if (data) setBlackouts((prev) => [...prev, data].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    setBoStart('')
    setBoEnd('')
    setBoReason('')
  }

  async function removeBlackout(id: string) {
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('provider_blackouts').delete().eq('id', id)
    if (deleteError) {
      alert(deleteError.message)
      return
    }
    setBlackouts((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <>
      <div className="card">
        {hoursError && <div className="form-error">{hoursError}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {DAYS.map((d) => (
            <label
              key={d.value}
              className="tag"
              style={{
                cursor: 'pointer',
                background: selectedDays.has(d.value) ? 'var(--brand)' : undefined,
                color: selectedDays.has(d.value) ? '#fff' : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={selectedDays.has(d.value)}
                onChange={() => toggleDay(d.value)}
                style={{ marginRight: 6 }}
              />
              {d.label}
            </label>
          ))}
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label htmlFor="startTime">Start time</label>
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="endTime">End time</label>
            <input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={saveHours}
          disabled={savingHours}
          style={{ marginTop: 16 }}
        >
          {savingHours ? 'Saving…' : 'Save weekly hours'}
        </button>
      </div>

      <div className="section">
        <h3>Time off</h3>
        <div className="card">
          {boError && <div className="form-error">{boError}</div>}
          {blackouts.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>No time off scheduled.</p>
          )}
          {blackouts.map((b) => (
            <div key={b.id} className="list-row">
              <div>
                <strong>{new Date(b.starts_at).toLocaleString()}</strong>
                {' – '}
                {new Date(b.ends_at).toLocaleString()}
                {b.reason && <div className="muted" style={{ fontSize: 14 }}>{b.reason}</div>}
              </div>
              <button className="btn btn-ghost" onClick={() => removeBlackout(b.id)}>
                Remove
              </button>
            </div>
          ))}
          <div className="grid grid-2" style={{ gap: 12, marginTop: 16 }}>
            <div>
              <label htmlFor="boStart">From</label>
              <input
                id="boStart"
                type="datetime-local"
                value={boStart}
                onChange={(e) => setBoStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="boEnd">To</label>
              <input
                id="boEnd"
                type="datetime-local"
                value={boEnd}
                onChange={(e) => setBoEnd(e.target.value)}
              />
            </div>
          </div>
          <label htmlFor="boReason">Reason (optional)</label>
          <input
            id="boReason"
            type="text"
            value={boReason}
            onChange={(e) => setBoReason(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={addBlackout}
            disabled={savingBo}
            style={{ marginTop: 12 }}
          >
            {savingBo ? 'Adding…' : 'Add time off'}
          </button>
        </div>
      </div>
    </>
  )
}
