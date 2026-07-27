/** Format a cents amount as CAD, e.g. 17900 -> "$179". */
export function formatPrice(cents: number): string {
  const dollars = cents / 100
  const hasCents = dollars % 1 !== 0
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** Format a minute count as "Xh Ym" (or "Xh" / "Ym"). */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : ''
  const m = Math.abs(minutes)
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${sign}${rem}m`
  if (rem === 0) return `${sign}${h}h`
  return `${sign}${h}h ${rem}m`
}

/** Format an ISO timestamp for display in America/Toronto. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(iso))
}

/** Maps a booking status to its tag CSS class. */
const STATUS_TAG: Record<string, string> = {
  requested: 'tag',
  confirmed: 'tag good',
  in_progress: 'tag good',
  completed: 'tag good',
  cancelled: 'tag bad',
}

/** CSS class for the status tag pill of a given booking status. */
export function statusTagClass(status: string): string {
  return STATUS_TAG[status] ?? 'tag'
}
