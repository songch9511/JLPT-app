import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { hashId } from '../src/identity'
import { plan } from '../src/webhook'
import { BASE, call, deps, fakeFetch, rcFree, rcPlus, req, T0, testEnv, USER, USER2 } from './helpers'

const AUTH = 'Bearer test-webhook-secret'

let n = 0
function event(over: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: `evt-${++n}`,
      type: 'NON_RENEWING_PURCHASE',
      event_timestamp_ms: T0,
      environment: 'PRODUCTION',
      app_user_id: USER,
      original_app_user_id: USER,
      aliases: [USER],
      entitlement_ids: ['plus'],
      product_id: 'luma_plus_lifetime',
      store: 'APP_STORE',
      ...over,
    },
  }
}

const hook = (payload: unknown, auth: string | null = AUTH, f = fakeFetch({}), e = testEnv()) =>
  call(
    new Request(`${BASE}/v1/webhooks/revenuecat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth === null ? {} : { Authorization: auth }) },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
    deps(f.fn),
    e,
  )

const stateOf = async (id: string) =>
  (
    await env.DB.prepare('SELECT state FROM entitlements WHERE user_hash = ?1')
      .bind(await hashId(testEnv(), 'user', id))
      .first<{ state: string }>()
  )?.state

const plus = async (fetchFn: typeof fetch) =>
  (await (await call(req('/v1/entitlement'), deps(fetchFn))).json<{ plus: boolean }>()).plus

describe('webhook auth', () => {
  it('rejects a missing or wrong Authorization header and changes nothing', async () => {
    for (const auth of [null, '', 'Bearer wrong', 'test-webhook-secret', 'bearer test-webhook-secret']) {
      const res = await hook(event(), auth)
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } })
    }
    expect(await stateOf(USER)).toBeUndefined()
  })

  it('fails closed when the shared secret is not configured', async () => {
    const res = await hook(event(), AUTH, fakeFetch({}), testEnv({ REVENUECAT_WEBHOOK_AUTH: undefined }))
    expect(res.status).toBe(503)
  })

  it('rejects malformed, non-JSON and oversized bodies', async () => {
    expect((await hook('{nope')).status).toBe(400)
    expect((await hook({ event: { type: 'X' } })).status).toBe(400)
    expect((await hook({ event: { id: 'x', type: 'INITIAL_PURCHASE', padding: 'x'.repeat(70_000) } })).status).toBe(413)
  })
})

describe('webhook events', () => {
  it('a purchase marks the user active and clears a cached "no"', async () => {
    let paid = false
    const f = fakeFetch({ revenuecat: () => (paid ? rcPlus() : rcFree()) })
    expect(await plus(f.fn)).toBe(false) // caches "no" for 60s
    paid = true
    const res = await hook(event())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(await stateOf(USER)).toBe('active')
    expect(await plus(f.fn)).toBe(true) // cache was invalidated, so RevenueCat was asked again
  })

  it('a refund (CANCELLATION + CUSTOMER_SUPPORT) revokes immediately, cache included', async () => {
    let refunded = false
    const f = fakeFetch({ revenuecat: () => (refunded ? rcFree() : rcPlus()) })
    expect(await plus(f.fn)).toBe(true) // cached "yes"
    refunded = true
    await hook(event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: T0 + 1000 }))
    expect(await stateOf(USER)).toBe('inactive')
    expect(await plus(f.fn)).toBe(false)
  })

  it('a stored refund keeps the user out even while RevenueCat is down', async () => {
    await hook(event())
    await hook(event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: T0 + 1000 }))
    const down = fakeFetch({ revenuecat: () => new Response('', { status: 503 }) })
    expect(await plus(down.fn)).toBe(false)
  })

  it('EXPIRATION revokes', async () => {
    await hook(event())
    await hook(event({ type: 'EXPIRATION', event_timestamp_ms: T0 + 1 }))
    expect(await stateOf(USER)).toBe('inactive')
  })

  it('applies to every alias of the customer', async () => {
    await hook(event({ app_user_id: USER2, original_app_user_id: USER, aliases: [USER, USER2] }))
    expect(await stateOf(USER)).toBe('active')
    expect(await stateOf(USER2)).toBe('active')
  })

  it('TRANSFER: the old owner loses access, the new owner is re-verified', async () => {
    await hook(event())
    await hook(
      event({ type: 'TRANSFER', app_user_id: undefined, transferred_from: [USER], transferred_to: [USER2], event_timestamp_ms: T0 + 5 }),
    )
    expect(await stateOf(USER)).toBe('inactive')
    expect(await stateOf(USER2)).toBe('stale')
  })

  it('is idempotent: a retried delivery (same id) is acknowledged and not applied twice', async () => {
    const e = event()
    expect((await hook(e)).status).toBe(200)
    await hook(event({ type: 'EXPIRATION', event_timestamp_ms: T0 + 10 }))
    const again = await hook(e)
    expect(await again.json()).toMatchObject({ ok: true, duplicate: true })
    expect(await stateOf(USER)).toBe('inactive')
  })

  it('an older event delivered late does not overwrite newer state', async () => {
    await hook(event({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: T0 + 1000 }))
    await hook(event({ type: 'NON_RENEWING_PURCHASE', event_timestamp_ms: T0 }))
    expect(await stateOf(USER)).toBe('inactive')
  })

  it('ignores sandbox events in production config, accepts them when enabled', async () => {
    const res = await hook(event({ environment: 'SANDBOX' }))
    expect(await res.json()).toMatchObject({ ignored: 'sandbox' })
    expect(await stateOf(USER)).toBeUndefined()
    await hook(event({ environment: 'SANDBOX' }), AUTH, fakeFetch({}), testEnv({ ACCEPT_SANDBOX_EVENTS: 'true' }))
    expect(await stateOf(USER)).toBe('active')
  })

  it('acknowledges TEST events and unknown event types without failing', async () => {
    expect((await hook(event({ type: 'TEST' }))).status).toBe(200)
    expect((await hook(event({ type: 'SOMETHING_NEW_2027' }))).status).toBe(200)
    expect(await stateOf(USER)).toBe('stale')
  })

  it('events for other entitlements leave ours alone', async () => {
    await hook(event({ entitlement_ids: ['other'] }))
    expect(await stateOf(USER)).toBeUndefined()
  })

  it('stores no raw app user ids', async () => {
    await hook(event({ app_user_id: USER2, aliases: [USER, USER2] }))
    const dump = JSON.stringify([
      (await env.DB.prepare('SELECT * FROM entitlements').all()).results,
      (await env.DB.prepare('SELECT * FROM webhook_events').all()).results,
    ])
    expect(dump).not.toContain('RCAnonymousID')
  })
})

describe('webhook plan()', () => {
  const base = { id: 'e', type: 'INITIAL_PURCHASE', app_user_id: 'a', original_app_user_id: 'b', aliases: ['c'], entitlement_ids: ['plus'] }
  it('maps event types to actions', () => {
    expect(plan(base, 'plus')).toEqual([{ ids: ['a', 'b', 'c'], action: 'active' }])
    expect(plan({ ...base, type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }, 'plus')[0]!.action).toBe('stale')
    expect(plan({ ...base, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }, 'plus')[0]!.action).toBe('inactive')
    expect(plan({ ...base, type: 'BILLING_ISSUE' }, 'plus')[0]!.action).toBe('stale')
    expect(plan({ ...base, type: 'REFUND' }, 'plus')[0]!.action).toBe('inactive')
    expect(plan({ ...base, type: 'TEST' }, 'plus')).toEqual([])
    // a grant event that does not name our entitlement is not trusted as a grant
    expect(plan({ ...base, entitlement_ids: null }, 'plus')[0]!.action).toBe('stale')
  })
})
