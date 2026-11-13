import type { Env } from './env'
import { ApiError } from './http'

/**
 * App user ids we accept: RevenueCat anonymous ids (`$RCAnonymousID:` + hex) and, should the app
 * later set its own ids, a UUID. Anything else is rejected before any lookup, which keeps
 * RevenueCat from being asked about (and creating) arbitrary customers.
 */
const RC_ANON = /^\$RCAnonymousID:[0-9a-f]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isAppUserId = (s: string): boolean => s.length <= 100 && (RC_ANON.test(s) || UUID.test(s))

/** Reads `Authorization: Bearer <app user id>`. */
export function appUserIdFrom(request: Request): string {
  const h = request.headers.get('Authorization') ?? ''
  const m = /^Bearer (.+)$/.exec(h)
  const id = m?.[1]?.trim() ?? ''
  if (!isAppUserId(id)) throw new ApiError('invalid_user')
  return id
}

const enc = new TextEncoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret)
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    keyCache.set(secret, k)
  }
  return k
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function pepper(env: Env): string {
  const p = env.USER_ID_PEPPER
  if (!p || p.length < 16) throw new ApiError('misconfigured')
  return p
}

/**
 * What we store instead of the app user id: HMAC-SHA256(pepper, purpose + id). Without the pepper
 * the stored value cannot be linked back to a RevenueCat customer.
 */
export async function hashId(env: Env, purpose: 'user' | 'ip', value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(pepper(env)), enc.encode(`${purpose}:${value}`))
  return hex(sig)
}

/** Constant-time string comparison (both sides are hashed first so lengths do not leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(da)
  const y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!
  return diff === 0 && a.length === b.length
}
