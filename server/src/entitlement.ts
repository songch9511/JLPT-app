import { z } from 'zod'
import type { Config, Deps, Env } from './env'
import { ApiError } from './http'

export const REVENUECAT_API = 'https://api.revenuecat.com/v1'

export type EntitlementSource = 'cache' | 'revenuecat' | 'stored'
export interface Entitlement {
  plus: boolean
  source: EntitlementSource
}

const cacheKey = (userHash: string) => `ent:v1:${userHash}`
const NEGATIVE_TTL = 60 // KV minimum; a just-purchased user is also unblocked by the purchase webhook

// Only the fields we read. Unknown fields are ignored; a wrong type on these fails closed.
const Subscriber = z.object({
  subscriber: z.object({
    entitlements: z
      .record(
        z.string(),
        z.object({
          expires_date: z.string().nullable().optional(),
          grace_period_expires_date: z.string().nullable().optional(),
        }),
      )
      .default({}),
  }),
})

function activeAt(e: { expires_date?: string | null; grace_period_expires_date?: string | null }, now: number) {
  // Lifetime (non-consumable) purchases have expires_date null.
  if (e.expires_date === null || e.expires_date === undefined) return true
  const exp = Date.parse(e.expires_date)
  const grace = e.grace_period_expires_date ? Date.parse(e.grace_period_expires_date) : NaN
  return (Number.isFinite(exp) && exp > now) || (Number.isFinite(grace) && grace > now)
}

class Upstream extends Error {}

async function fetchFromRevenueCat(appUserId: string, env: Env, cfg: Config, deps: Deps): Promise<boolean> {
  const key = env.REVENUECAT_SECRET_KEY
  if (!key) throw new ApiError('misconfigured')
  let res: Response
  try {
    res = await deps.fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(cfg.revenueCatTimeoutMs),
    })
  } catch {
    throw new Upstream('network')
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('misconfigured')
  if (!res.ok) throw new Upstream(String(res.status))
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Upstream('body')
  }
  const parsed = Subscriber.safeParse(body)
  if (!parsed.success) throw new Upstream('shape')
  const ent = parsed.data.subscriber.entitlements[cfg.entitlementId]
  return ent !== undefined && activeAt(ent, deps.now())
}

async function store(env: Env, userHash: string, plus: boolean, now: number) {
  await env.DB.prepare(
    `INSERT INTO entitlements (user_hash, state, source, updated_at) VALUES (?1, ?2, 'api', ?3)
     ON CONFLICT (user_hash) DO UPDATE SET state = ?2, source = 'api', updated_at = ?3`,
  )
    .bind(userHash, plus ? 'active' : 'inactive', now)
    .run()
}

/**
 * Plus check, in order: KV cache (short TTL) -> RevenueCat REST API (source of truth) ->
 * last state stored in D1 (only when RevenueCat is unreachable). `refresh` skips a cached "no",
 * for the moment right after a purchase.
 */
export async function getEntitlement(
  appUserId: string,
  userHash: string,
  env: Env,
  cfg: Config,
  deps: Deps,
  opts: { refresh?: boolean } = {},
): Promise<Entitlement> {
  const cached = await env.CACHE.get(cacheKey(userHash))
  if (cached === '1') return { plus: true, source: 'cache' }
  if (cached === '0' && !opts.refresh) return { plus: false, source: 'cache' }

  try {
    const plus = await fetchFromRevenueCat(appUserId, env, cfg, deps)
    await Promise.all([
      env.CACHE.put(cacheKey(userHash), plus ? '1' : '0', {
        expirationTtl: plus ? cfg.entitlementCacheTtl : NEGATIVE_TTL,
      }),
      store(env, userHash, plus, deps.now()),
    ])
    return { plus, source: 'revenuecat' }
  } catch (e) {
    if (!(e instanceof Upstream)) throw e
    const row = await env.DB.prepare('SELECT state FROM entitlements WHERE user_hash = ?1')
      .bind(userHash)
      .first<{ state: string }>()
    if (row?.state === 'active') return { plus: true, source: 'stored' }
    if (row?.state === 'inactive') return { plus: false, source: 'stored' }
    throw new ApiError('upstream_unavailable', 30)
  }
}

export async function invalidateEntitlement(env: Env, userHash: string): Promise<void> {
  await env.CACHE.delete(cacheKey(userHash))
}
