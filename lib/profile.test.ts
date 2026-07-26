import { describe, expect, it } from 'vitest'
import {
  checkPassword,
  formatPhone,
  forwardSortationArea,
  isValidPostalCode,
  normalizePhone,
  normalizePostalCode,
} from './profile'

describe('normalizePostalCode', () => {
  it('formats a complete code with a single space', () => {
    expect(normalizePostalCode('k1a0b1')).toBe('K1A 0B1')
    expect(normalizePostalCode('K1A-0B1')).toBe('K1A 0B1')
    expect(normalizePostalCode('  k1a 0b1 ')).toBe('K1A 0B1')
  })

  it('leaves a partially typed code alone so it can still be edited', () => {
    expect(normalizePostalCode('K1A')).toBe('K1A')
    expect(normalizePostalCode('K1A 0B')).toBe('K1A0B')
  })
})

describe('isValidPostalCode', () => {
  it('accepts the Canada Post pattern in any spacing or case', () => {
    expect(isValidPostalCode('K1A 0B1')).toBe(true)
    expect(isValidPostalCode('k1a0b1')).toBe(true)
  })

  it('rejects US ZIPs, wrong lengths, and transposed patterns', () => {
    expect(isValidPostalCode('90210')).toBe(false)
    expect(isValidPostalCode('K1A 0B')).toBe(false)
    expect(isValidPostalCode('1KA 0B1')).toBe(false)
    expect(isValidPostalCode('')).toBe(false)
  })
})

describe('forwardSortationArea', () => {
  it('takes the first three characters used for provider dispatch', () => {
    expect(forwardSortationArea('K1A 0B1')).toBe('K1A')
    expect(forwardSortationArea('k2p1l4')).toBe('K2P')
  })
})

describe('normalizePhone', () => {
  it('adds +1 to a bare 10-digit North American number', () => {
    expect(normalizePhone('613 555 0142')).toBe('+16135550142')
    expect(normalizePhone('(613) 555-0142')).toBe('+16135550142')
  })

  it('keeps an existing country code', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizePhone('1-613-555-0142')).toBe('+16135550142')
  })

  it('returns empty for blank or too-short input rather than a bad number', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
    expect(normalizePhone('555-0142')).toBe('')
  })
})

describe('formatPhone', () => {
  it('renders a stored E.164 number for humans', () => {
    expect(formatPhone('+16135550142')).toBe('(613) 555-0142')
  })

  it('passes through anything it cannot parse, including null', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone('+442079460958')).toBe('+442079460958')
  })
})

describe('checkPassword', () => {
  it('accepts a password with letters, numbers and enough length', () => {
    expect(checkPassword('snowday2026', 'snowday2026')).toEqual({ ok: true, reason: '' })
  })

  it('rejects short passwords', () => {
    expect(checkPassword('short1', 'short1').ok).toBe(false)
  })

  it('requires both a letter and a number', () => {
    expect(checkPassword('allletters', 'allletters').ok).toBe(false)
    expect(checkPassword('12345678', '12345678').ok).toBe(false)
  })

  it('rejects a mismatched confirmation', () => {
    const r = checkPassword('snowday2026', 'snowday2027')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/match/)
  })
})
