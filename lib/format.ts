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

/**
 * Effective rate for a plan: price_cents / (monthly_minutes/60)
 * e.g. 17900 cents / 5h → "~$36/h of service time".
 */
export function formatEffectiveRate(priceCents: number, monthlyMinutes: number): string | null {
  if (!monthlyMinutes || monthlyMinutes <= 0) return null
  const hours = monthlyMinutes / 60
  const dollarsPerHour = priceCents / 100 / hours
  const rounded = Math.round(dollarsPerHour)
  return `~$${rounded}/h of service time`
}

/** Format an ISO timestamp for display in America/Toronto. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(iso))
}

/**
 * Normalize a Canadian postal code toward "A1A 1A1".
 * Returns the original trimmed string if it is not a 6-char alnum pattern.
 */
export function formatPostalCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length !== 6) return raw.trim()
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`
}

/** First 3 characters of a normalized postal code (FSA), or empty. */
export function postalFsa(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned.slice(0, 3)
}

/** Google Maps search URL for a free-form address (no API key). */
export function mapsSearchUrl(parts: {
  address_line1?: string | null
  city?: string | null
  postal_code?: string | null
}): string | null {
  const q = [parts.address_line1, parts.city, parts.postal_code, 'Ottawa', 'ON', 'Canada']
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ')
  if (!q || q === 'Ottawa, ON, Canada') return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
