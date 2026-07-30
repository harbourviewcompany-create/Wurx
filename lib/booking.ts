/**
 * Pure booking economics.
 *
 * These mirror the authoritative SQL in `request_booking` / `complete_booking`.
 * They are kept dependency-free so they can be unit tested, and so the client
 * can preview a cost without a round trip. The database remains the source of
 * truth — never trust a client-computed cost for a write.
 */

/**
 * Minutes deducted from a plan for a booking of `durationMinutes` of a service
 * with the given credit multiplier.
 *
 * Rounds UP, matching SQL `ceil(...)`: a 90-minute job at 1.5x costs 135, and a
 * 50-minute job at 0.75x costs 38 (not 37.5), so we never under-charge minutes.
 */
export function serviceCostMinutes(
  durationMinutes: number,
  creditMultiplier: number,
): number {
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(creditMultiplier)) return 0
  if (durationMinutes <= 0 || creditMultiplier <= 0) return 0
  return Math.ceil(durationMinutes * creditMultiplier)
}

export type Affordability = {
  cost: number
  affordable: boolean
  /** Minutes still needed; 0 when affordable. */
  shortfall: number
  /** Minutes left after booking; 0 when unaffordable. */
  remaining: number
}

export function affordability(cost: number, availableMinutes: number): Affordability {
  const available = Math.max(0, availableMinutes)
  const affordable = cost <= available
  return {
    cost,
    affordable,
    shortfall: affordable ? 0 : cost - available,
    remaining: affordable ? available - cost : 0,
  }
}

/** Shape the repeat-booking picker needs from a provider. */
export type RepeatProvider = {
  id: string
  business_name: string
  rating: number | null
  service_slugs: string[]
}

/**
 * Collapse a newest-first list of past bookings into one entry per pro,
 * preserving that order so the most recently used pro is offered first.
 *
 * Null entries are dropped: a booking whose provider embed came back null is a
 * pro who has since been deactivated or unverified. RLS hides them and
 * `request_booking` rejects them, so they must not reach the picker.
 */
export function dedupeRecentProviders<T extends { id: string }>(
  rows: (T | null | undefined)[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/**
 * Pros who actually cover `serviceSlug`.
 *
 * Offering one who doesn't would look like a choice but silently fall through
 * to an open fan-out, since `dispatch_booking_offers` skips a preferred
 * provider that `provider_can_serve_booking` rejects.
 */
export function providersForService<T extends { service_slugs: string[] }>(
  providers: T[],
  serviceSlug: string | null | undefined,
): T[] {
  if (!serviceSlug) return []
  return providers.filter((p) => p.service_slugs.includes(serviceSlug))
}

/**
 * Provider earnings split for a completed job. Mirrors `complete_booking`:
 * gross is pro-rated from an hourly rate, the platform fee is basis points of
 * gross, and net is the remainder.
 */
export function earningsSplit(
  workedMinutes: number,
  rateCentsPerHour: number,
  platformFeeBps: number,
): { grossCents: number; feeCents: number; netCents: number } {
  if (workedMinutes <= 0 || rateCentsPerHour <= 0) {
    return { grossCents: 0, feeCents: 0, netCents: 0 }
  }
  const grossCents = Math.round((workedMinutes / 60) * rateCentsPerHour)
  const bps = Math.min(Math.max(platformFeeBps, 0), 10_000)
  const feeCents = Math.round((grossCents * bps) / 10_000)
  return { grossCents, feeCents, netCents: grossCents - feeCents }
}
