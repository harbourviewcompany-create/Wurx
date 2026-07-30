import { describe, expect, it } from 'vitest'
import {
  affordability,
  dedupeRecentProviders,
  earningsSplit,
  providersForService,
  serviceCostMinutes,
} from './booking'
import { formatMinutes, formatPrice } from './format'

describe('serviceCostMinutes', () => {
  it('charges duration directly at a 1x multiplier', () => {
    expect(serviceCostMinutes(180, 1)).toBe(180)
  })

  it('discounts a cheaper service (snow removal at 0.75x)', () => {
    expect(serviceCostMinutes(60, 0.75)).toBe(45)
  })

  it('surcharges a specialised service (handyman at 1.5x)', () => {
    expect(serviceCostMinutes(120, 1.5)).toBe(180)
  })

  it('rounds UP so partial minutes are never given away', () => {
    // 50 * 0.75 = 37.5 -> 38, matching SQL ceil()
    expect(serviceCostMinutes(50, 0.75)).toBe(38)
    expect(serviceCostMinutes(45, 1.25)).toBe(57) // 56.25 -> 57
  })

  it('returns 0 for nonsensical input rather than NaN', () => {
    expect(serviceCostMinutes(0, 1)).toBe(0)
    expect(serviceCostMinutes(-30, 1)).toBe(0)
    expect(serviceCostMinutes(60, 0)).toBe(0)
    expect(serviceCostMinutes(Number.NaN, 1)).toBe(0)
  })
})

describe('affordability', () => {
  it('reports remaining balance when affordable', () => {
    expect(affordability(120, 480)).toEqual({
      cost: 120,
      affordable: true,
      shortfall: 0,
      remaining: 360,
    })
  })

  it('treats an exact-balance booking as affordable', () => {
    const a = affordability(480, 480)
    expect(a.affordable).toBe(true)
    expect(a.remaining).toBe(0)
    expect(a.shortfall).toBe(0)
  })

  it('reports the shortfall when short by even one minute', () => {
    const a = affordability(481, 480)
    expect(a.affordable).toBe(false)
    expect(a.shortfall).toBe(1)
    expect(a.remaining).toBe(0)
  })

  it('never treats a negative balance as spendable', () => {
    const a = affordability(30, -100)
    expect(a.affordable).toBe(false)
    expect(a.shortfall).toBe(30)
  })
})

describe('earningsSplit', () => {
  it('matches the values the database produced for a 2h job at $22/h, 20%', () => {
    // Verified against complete_booking(): gross 4400, fee 880, net 3520
    expect(earningsSplit(120, 2200, 2000)).toEqual({
      grossCents: 4400,
      feeCents: 880,
      netCents: 3520,
    })
  })

  it('pro-rates partial hours', () => {
    expect(earningsSplit(90, 2000, 2000)).toEqual({
      grossCents: 3000,
      feeCents: 600,
      netCents: 2400,
    })
  })

  it('pays the full gross when the fee is zero', () => {
    const s = earningsSplit(60, 5000, 0)
    expect(s.feeCents).toBe(0)
    expect(s.netCents).toBe(s.grossCents)
  })

  it('clamps an out-of-range fee instead of paying a negative net', () => {
    const s = earningsSplit(60, 5000, 99_999)
    expect(s.feeCents).toBe(s.grossCents)
    expect(s.netCents).toBe(0)
  })

  it('always keeps gross = fee + net', () => {
    for (const [mins, rate, bps] of [
      [30, 1750, 1500],
      [45, 2333, 2000],
      [200, 999, 3333],
    ] as const) {
      const s = earningsSplit(mins, rate, bps)
      expect(s.feeCents + s.netCents).toBe(s.grossCents)
    }
  })
})

describe('repeat-booking pro picker', () => {
  const pro = (id: string, slugs: string[] = ['home-cleaning']) => ({
    id,
    business_name: `Pro ${id}`,
    rating: null,
    service_slugs: slugs,
  })

  it('keeps one entry per pro, most recently used first', () => {
    // Rows arrive newest-first, and a repeat customer books the same pro often.
    const rows = [pro('b'), pro('a'), pro('b'), pro('c'), pro('a')]
    expect(dedupeRecentProviders(rows).map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('drops pros whose row came back null', () => {
    // A null embed means deactivated or unverified — RLS hid them, and
    // request_booking would reject them, so they must not be offered.
    const rows = [pro('a'), null, undefined, pro('b')]
    expect(dedupeRecentProviders(rows).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('offers only pros who cover the chosen service', () => {
    const pros = [pro('a', ['home-cleaning']), pro('b', ['snow-removal', 'home-cleaning'])]
    expect(providersForService(pros, 'snow-removal').map((p) => p.id)).toEqual(['b'])
    expect(providersForService(pros, 'home-cleaning').map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('offers nobody before a service is chosen', () => {
    expect(providersForService([pro('a')], null)).toEqual([])
    expect(providersForService([pro('a')], undefined)).toEqual([])
  })

  it('offers nobody when no past pro covers the service', () => {
    expect(providersForService([pro('a', ['handyman'])], 'lawn-garden')).toEqual([])
  })
})

describe('formatting', () => {
  it('formats minutes the way the UI shows plan time', () => {
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(150)).toBe('2h 30m')
    expect(formatMinutes(480)).toBe('8h')
  })

  it('formats whole-dollar prices without cents', () => {
    expect(formatPrice(17900)).toBe('$179')
    expect(formatPrice(33900)).toBe('$339')
  })

  it('keeps cents when they are non-zero', () => {
    expect(formatPrice(3520)).toBe('$35.20')
  })
})
