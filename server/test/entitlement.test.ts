import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { hashId } from '../src/identity'
import { call, deps, fakeFetch, rcFree, rcPlus, rcSubscriber, req, T0, testEnv, USER } from './helpers'

const ent = (fetchFn: typeof fetch, opts: { user?: string | null; query?: string } = {}) =>
  call(req(`/v1/entitlement${opts.query ?? ''}`, { user: opts.user }), deps(fetchFn))

const body = (res: Response) => res.json<{ plus: boolean; stale: boolean; story: { limit: number; used: number; remaining: number } }>()

describe('entitlement: identity', () => {
  it('rejects a missing, malformed or over-long app user id before calling RevenueCat', async () => {
    const f = fakeFetch({ revenuecat: () => rcPlus() })
    for (const user of [null, '', 'alice', '$RCAnonymousID:xyz', `$RCAnonymousID:${'a'.repeat(65)}`, '../../admin', 'a'.repeat(200)]) {
      const res = await ent(f.fn, { user })
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_user' } })
    }
    expect(f.calls).toHaveLength(0)
  })

  it('accepts a UUID app user id too', async () => {
    const f = fakeFetch({ revenuecat: () => rcPlus() })
    const res = await ent(f.fn, { user: '7d444840-9dc0-41d0-a1c8-1b3bd4f39d4f' })
    expect(res.status).toBe(200)
  })
})

describe('entitlement: RevenueCat states', () => {
  it('lifetime purchase (expires_date null) -> plus, with the secret key as Bearer', async () => {
    const f = fakeFetch({ revenuecat: () => rcPlus() })
    const res = await ent(f.fn)
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({ plus: true, stale: false, story: { limit: 1, used: 0, remaining: 1 } })
    const [c] = f.calls
    expect(c!.url).toBe(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(USER)}`)
    expect(c!.headers.get('Authorization')).toBe('Bearer test-revenuecat-key')
  })

  it('no entitlement -> not plus, story remaining 0', async () => {
    const res = await ent(fakeFetch({ revenuecat: () => rcFree() }).fn)
    expect(await body(res)).toMatchObject({ plus: false, story: { remaining: 0 } })
  })

  it('a different entitlement id does not count', async () => {
    const res = await ent(fakeFetch({ revenuecat: () => rcSubscriber({ pro: { expires_date: null } }) }).fn)
    expect((await body(res)).plus).toBe(false)
  })

  it('expired entitlement -> not plus; within grace period -> plus', async () => {
    const past = new Date(T0 - 86_400_000).toISOString()
    const future = new Date(T0 + 86_400_000).toISOString()
    expect((await body(await ent(fakeFetch({ revenuecat: () => rcSubscriber({ plus: { expires_date: past } }) }).fn))).plus).toBe(false)
    await env.CACHE.delete(`ent:v1:${await hashId(testEnv(), 'user', USER)}`)
    const grace = rcSubscriber({ plus: { expires_date: past, grace_period_expires_date: future } })
    expect((await body(await ent(fakeFetch({ revenuecat: () => grace }).fn))).plus).toBe(true)
  })

  it('caches a yes in KV: the second check does not call RevenueCat', async () => {
    const f = fakeFetch({ revenuecat: () => rcPlus() })
    await ent(f.fn)
    await ent(f.fn)
    expect(f.calls).toHaveLength(1)
  })

  it('caches a no briefly, and ?refresh=1 bypasses only that', async () => {
    let plus = false
    const f = fakeFetch({ revenuecat: () => (plus ? rcPlus() : rcFree()) })
    expect((await body(await ent(f.fn))).plus).toBe(false)
    plus = true
    expect((await body(await ent(f.fn))).plus).toBe(false) // cached no
    expect((await body(await ent(f.fn, { query: '?refresh=1' }))).plus).toBe(true)
    expect(f.calls).toHaveLength(2)
  })

  it('stores only the peppered hash and the state in D1', async () => {
    await ent(fakeFetch({ revenuecat: () => rcPlus() }).fn)
    const rows = await env.DB.prepare('SELECT * FROM entitlements').all()
    expect(rows.results).toHaveLength(1)
    const row = rows.results[0] as Record<string, unknown>
    expect(row.user_hash).toBe(await hashId(testEnv(), 'user', USER))
    expect(row.state).toBe('active')
    expect(JSON.stringify(rows.results)).not.toContain('RCAnonymousID')
  })
})

describe('entitlement: RevenueCat failures', () => {
  const failures: [string, () => Response | Promise<Response>][] = [
    ['500', () => new Response('oops', { status: 500 })],
    ['429', () => Response.json({ code: 7, backoff_ms: 1000 }, { status: 429 })],
    ['non-JSON body', () => new Response('<html>', { status: 200 })],
    ['unexpected shape', () => Response.json({ subscriber: { entitlements: 'nope' } })],
    ['network error', () => Promise.reject(new TypeError('network'))],
  ]

  for (const [name, route] of failures) {
    it(`${name} with no stored state -> 503 upstream_unavailable`, async () => {
      const res = await ent(fakeFetch({ revenuecat: route }).fn)
      expect(res.status).toBe(503)
      expect(res.headers.get('Retry-After')).toBe('30')
      expect(await res.json()).toMatchObject({ error: { code: 'upstream_unavailable' } })
    })
  }

  it('falls back to the last stored state (and says so) when RevenueCat is down', async () => {
    await ent(fakeFetch({ revenuecat: () => rcPlus() }).fn)
    await env.CACHE.delete(`ent:v1:${await hashId(testEnv(), 'user', USER)}`)
    const res = await ent(fakeFetch({ revenuecat: () => new Response('', { status: 502 }) }).fn)
    expect(await body(res)).toMatchObject({ plus: true, stale: true })
  })

  it('times out a hanging RevenueCat call', async () => {
    const hang = fakeFetch({ revenuecat: () => new Promise<Response>(() => {}) })
    const e = testEnv({ REVENUECAT_TIMEOUT_MS: '500' })
    const started = Date.now()
    const res = await call(req('/v1/entitlement'), deps(hang.fn), e)
    expect(res.status).toBe(503)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('a rejected secret key is a server misconfiguration, not the user’s problem', async () => {
    const res = await ent(fakeFetch({ revenuecat: () => new Response('', { status: 401 }) }).fn)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'misconfigured' } })
  })

  it('missing secrets fail closed', async () => {
    const f = fakeFetch({ revenuecat: () => rcPlus() })
    expect((await call(req('/v1/entitlement'), deps(f.fn), testEnv({ REVENUECAT_SECRET_KEY: undefined }))).status).toBe(503)
    expect((await call(req('/v1/entitlement'), deps(f.fn), testEnv({ USER_ID_PEPPER: 'short' }))).status).toBe(503)
  })
})
