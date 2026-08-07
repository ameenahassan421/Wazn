/**
 * Identifier handling for the auth screen: is this an email or a username,
 * and what exactly do we send to the server?
 *
 * The dot rule exists because of a real incident: one Gmail inbox produced
 * two Wazn accounts, and nine months of history landed on the one its owner
 * did not sign in with (the profile-merge entry in DECISIONS.md). Gmail
 * ignores dots in the local part, so for Gmail domains the address is
 * normalised before it ever reaches Supabase — a typed dot can no longer
 * mint a second account. Other providers treat dots as meaningful, so they
 * pass through untouched.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Matches `profiles_username_check` in migration 0011. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function isEmail(value: string): boolean {
  return value.includes('@')
}

export function normalizeEmail(value: string): string {
  const address = value.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at < 1) return address
  const local = address.slice(0, at)
  const domain = address.slice(at + 1)
  if (!GMAIL_DOMAINS.has(domain)) return address
  return `${local.replaceAll('.', '')}@${domain}`
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '')
}

export type Identifier =
  | { kind: 'email'; value: string }
  | { kind: 'username'; value: string }
  | { kind: 'invalid'; value: string }

/**
 * An `@` after the first character means email — usernames cannot contain
 * one (0011's check constraint). A *leading* `@` is the opposite signal: the
 * `@handle` convention, so `@ameen` is a username, not a broken address.
 * Anything else must look like a username to be one; the remainder is a
 * typo, and naming it beats guessing.
 */
export function classifyIdentifier(raw: string): Identifier {
  const value = raw.trim()
  if (value.length === 0) return { kind: 'invalid', value }
  if (value.indexOf('@') > 0) return { kind: 'email', value: normalizeEmail(value) }
  const username = normalizeUsername(value)
  if (USERNAME_RE.test(username)) return { kind: 'username', value: username }
  return { kind: 'invalid', value }
}

/**
 * `a•••@g•••.com` — enough to recognise your own address, not enough to learn
 * someone else's. Only ever shown after a successful verification.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1) return '•••'
  const local = address.slice(0, at)
  const domain = address.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const domainName = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local[0]}•••@${domainName[0]}•••${tld}`
}
