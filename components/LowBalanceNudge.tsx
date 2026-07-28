import Link from 'next/link'
import { formatMinutes } from '@/lib/format'

/** Soft upgrade prompt when available minutes are thin. */
export function LowBalanceNudge({
  availableMinutes,
  monthlyMinutes,
}: {
  availableMinutes: number
  monthlyMinutes: number
}) {
  const threshold =
    monthlyMinutes > 0 ? Math.min(60, Math.max(30, Math.round(monthlyMinutes * 0.15))) : 45

  if (availableMinutes <= 0 || availableMinutes > threshold) return null

  return (
    <div
      className="card rise"
      role="status"
      style={{
        marginTop: 18,
        borderColor: 'rgba(168, 121, 31, 0.45)',
        background: 'rgba(168, 121, 31, 0.08)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        Running low — {formatMinutes(availableMinutes)} left
      </p>
      <p className="muted" style={{ margin: '6px 0 12px' }}>
        Upgrade your plan so the next job isn’t blocked mid-season. Your current balance carries
        over until it refreshes.
      </p>
      <Link href="/pricing" className="btn btn-primary">
        See plans
      </Link>
    </div>
  )
}
