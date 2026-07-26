/**
 * Pure profile-field helpers.
 *
 * Kept dependency-free so the account form, the booking form and the tests all
 * agree on what a valid Canadian address looks like. The database is still the
 * source of truth for what it will accept — these only stop obvious typos
 * before a round trip.
 */

/**
 * Normalise a Canadian postal code to the canonical `A1A 1A1` form.
 * Returns the trimmed, uppercased input unchanged when it isn't six
 * alphanumerics, so partially-typed values survive editing.
 */
export function normalizePostalCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length !== 6) return compact
  return `${compact.slice(0, 3)} ${compact.slice(3)}`
}

/** Canada Post format: letter-digit-letter, space optional, digit-letter-digit. */
export function isValidPostalCode(input: string): boolean {
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(input.toUpperCase().replace(/[^A-Z0-9]/g, ''))
}

/** The forward sortation area — the first three characters, used for dispatch. */
export function forwardSortationArea(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

/**
 * Reduce a typed phone number to E.164 for storage. North American numbers get
 * a `+1`; anything already carrying a `+` keeps its own country code. Returns
 * an empty string when there aren't enough digits to be a phone number.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '') return ''

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10) return ''

  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/** Display form for a stored E.164 North American number: `(613) 555-0142`. */
export function formatPhone(stored: string | null): string {
  if (!stored) return ''
  const digits = stored.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length !== 10) return stored
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}

export type PasswordCheck = {
  ok: boolean
  /** Human-readable reason the password was rejected; empty when ok. */
  reason: string
}

/**
 * Minimum bar for a new password. Supabase enforces its own project-level
 * policy server-side; this exists so the user is told *before* submitting.
 */
export function checkPassword(password: string, confirm: string): PasswordCheck {
  if (password.length < 8) {
    return { ok: false, reason: 'Use at least 8 characters.' }
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, reason: 'Include at least one letter and one number.' }
  }
  if (password !== confirm) {
    return { ok: false, reason: 'The two passwords don’t match.' }
  }
  return { ok: true, reason: '' }
}
