import { exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { call, deps, fakeFetch, req, storyReq, testEnv } from './helpers'

const d = () => deps(fakeFetch({}).fn)

describe('health', () => {
  it('reports ok, api version, data version and story availability', async () => {
    const res = await call(req('/v1/health', { user: null }), d())
    expect(res.status).toBe(200)
    const body = await res.json<Record<string, string>>()
    expect(body).toMatchObject({ status: 'ok', api: 'v1', story: 'available' })
    expect(body.words).toMatch(/^[0-9a-f]{12}$/)
  })

  it('works through the real Worker entry point', async () => {
    const res = await exports.default.fetch('https://api.test/v1/health')
    expect(res.status).toBe(200)
  })

  it('says paused once the day is at the spend ceiling', async () => {
    const env = testEnv({ GLOBAL_DAILY_SPEND_LIMIT_USD: '0' })
    const body = await (await call(req('/v1/health', { user: null }), d(), env)).json<{ story: string }>()
    expect(body.story).toBe('paused')
  })
})

describe('routing and headers', () => {
  it('404s unknown paths and unversioned paths with a typed error', async () => {
    for (const p of ['/nope', '/story', '/v2/story']) {
      const res = await call(req(p), d())
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
    }
  })

  it('405s wrong methods and lists the allowed ones', async () => {
    const res = await call(req('/v1/story', { method: 'GET' }), d())
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('POST')
  })

  it('sets security headers on every response', async () => {
    for (const r of [req('/v1/health'), req('/nope')]) {
      const res = await call(r, d())
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=')
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    }
  })
})

describe('CORS', () => {
  it('answers a preflight from an allowed origin', async () => {
    const res = await call(req('/v1/story', { method: 'OPTIONS', origin: 'capacitor://localhost', user: null }), d())
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('echoes an allowed origin on normal responses', async () => {
    const res = await call(req('/v1/health', { origin: 'https://app.example' }), d())
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
  })

  it('refuses other origins, including on preflight, without CORS headers', async () => {
    for (const r of [
      req('/v1/story', { method: 'OPTIONS', origin: 'https://evil.example', user: null }),
      storyReq(['w001'], { origin: 'https://evil.example' }),
      req('/v1/health', { origin: 'null' }),
    ]) {
      const res = await call(r, d())
      expect(res.status).toBe(403)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(await res.json()).toMatchObject({ error: { code: 'forbidden_origin' } })
    }
  })

  it('does not apply to requests without an Origin (native code, webhooks)', async () => {
    const res = await call(req('/v1/health'), d())
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('rate limiting', () => {
  afterEach(() => vi.restoreAllMocks())

  const deny = { limit: async () => ({ success: false }) } as unknown as RateLimit
  const allow = { limit: async () => ({ success: true }) } as unknown as RateLimit

  it('rejects when the per-IP limit says no', async () => {
    const res = await call(req('/v1/entitlement', { ip: '203.0.113.9' }), d(), testEnv({ RL_IP: deny, RL_USER: allow }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
  })

  it('rejects when the per-user limit says no', async () => {
    const res = await call(req('/v1/entitlement', { ip: '203.0.113.9' }), d(), testEnv({ RL_IP: allow, RL_USER: deny }))
    expect(res.status).toBe(429)
  })

  it('keys limits by hashes, never by the raw IP or app user id', async () => {
    const keys: string[] = []
    const spy = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) } as unknown as RateLimit
    await call(req('/v1/entitlement', { ip: '203.0.113.9' }), d(), testEnv({ RL_IP: allow, RL_USER: spy }))
    await call(req('/v1/entitlement', { ip: '203.0.113.9' }), d(), testEnv({ RL_IP: spy }))
    expect(keys).toHaveLength(2)
    for (const k of keys) {
      expect(k).toMatch(/^(ip|user):[0-9a-f]{32}$/)
      expect(k).not.toContain('203.0.113.9')
      expect(k).not.toContain('RCAnonymousID')
    }
  })

  it('the configured Workers rate-limit bindings exist and answer', async () => {
    const e = testEnv()
    const { env } = await import('cloudflare:workers')
    const real = env as unknown as { RL_IP?: RateLimit; RL_USER?: RateLimit }
    expect(e.RL_IP).toBeUndefined()
    expect(typeof real.RL_IP?.limit).toBe('function')
    expect((await real.RL_USER!.limit({ key: 'probe' })).success).toBe(true)
  })
})
