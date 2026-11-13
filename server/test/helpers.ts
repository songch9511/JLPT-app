import { env } from 'cloudflare:workers'
import type { Deps, Env } from '../src/env'
import { handle } from '../src/index'

export const USER = '$RCAnonymousID:0123456789abcdef0123456789abcdef'
export const USER2 = '$RCAnonymousID:fedcba9876543210fedcba9876543210'
export const BASE = 'https://api.test'

/** 2026-11-13 10:00 KST */
export const T0 = Date.UTC(2026, 10, 13, 1, 0, 0)

/** Test env: real D1/KV from Miniflare; rate-limit bindings removed unless a test supplies fakes. */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), RL_IP: undefined, RL_USER: undefined, ...overrides }
}

export interface Call {
  url: string
  method: string
  headers: Headers
  body: string
}

export type Route = (call: Call) => Response | Promise<Response>

/**
 * A fetch stand-in for the outbound boundary. Unhandled hosts throw, so a test fails loudly if
 * the Worker tries to reach anything real.
 */
export function fakeFetch(routes: { revenuecat?: Route; anthropic?: Route }) {
  const calls: Call[] = []
  const fn: typeof fetch = async (input, init) => {
    const req = new Request(input as RequestInfo, init)
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const call: Call = { url: req.url, method: req.method, headers: req.headers, body: await req.text() }
    calls.push(call)
    const host = new URL(req.url).host
    const route = host === 'api.revenuecat.com' ? routes.revenuecat : host === 'api.anthropic.com' ? routes.anthropic : undefined
    if (!route) throw new Error(`unexpected outbound request to ${host}`)
    // honour aborts while the route is "in flight"
    return await new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('aborted', 'AbortError')))
      Promise.resolve(route(call)).then(resolve, reject)
    })
  }
  return { fn, calls, to: (host: string) => calls.filter((c) => new URL(c.url).host === host) }
}

export function deps(fetchFn: typeof fetch, now = T0): Deps & { clock: { now: number } } {
  const clock = { now }
  return { clock, now: () => clock.now, fetch: fetchFn }
}

export function req(path: string, init: RequestInit & { user?: string | null; origin?: string; ip?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.user !== null) headers.set('Authorization', `Bearer ${init.user ?? USER}`)
  if (init.origin) headers.set('Origin', init.origin)
  if (init.ip) headers.set('CF-Connecting-IP', init.ip)
  return new Request(`${BASE}${path}`, { ...init, headers })
}

export function storyReq(wordIds: unknown, init: Parameters<typeof req>[1] = {}) {
  return req('/v1/story', {
    method: 'POST',
    body: JSON.stringify({ wordIds }),
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
  })
}

export const call = (r: Request, d: Deps, e: Env = testEnv()) => handle(r, e, d)

// ---- RevenueCat fixtures ----

export function rcSubscriber(entitlements: Record<string, { expires_date: string | null; grace_period_expires_date?: string | null }>) {
  return Response.json({
    request_date: new Date(T0).toISOString(),
    request_date_ms: T0,
    subscriber: {
      original_app_user_id: USER,
      entitlements: Object.fromEntries(
        Object.entries(entitlements).map(([k, v]) => [
          k,
          { purchase_date: '2026-11-01T00:00:00Z', product_identifier: 'luma_plus_lifetime', grace_period_expires_date: null, ...v },
        ]),
      ),
      non_subscriptions: {},
      subscriptions: {},
    },
  })
}

export const rcPlus = () => rcSubscriber({ plus: { expires_date: null } })
export const rcFree = () => rcSubscriber({})

// ---- Anthropic fixtures ----

export const goodStory = (words: string[]) => ({
  title: '정원의 하루',
  lines: [
    { ja: `${words[0] ?? '庭'}で猫が寝ています。`, kana: 'にわで ねこが ねて います。', ko: '정원에서 고양이가 자고 있습니다.' },
    { ja: `${words[1] ?? '私'}は猫を見ました。`, kana: 'わたしは ねこを みました。', ko: '저는 고양이를 봤습니다.' },
    { ja: '猫はとても静かでした。', kana: 'ねこは とても しずかでした。', ko: '고양이는 아주 조용했습니다.' },
    { ja: 'また明日も来ます。', kana: 'また あしたも きます。', ko: '내일도 또 오겠습니다.' },
  ],
})

export function anthropicMessage(
  text: string,
  opts: { stop_reason?: string; usage?: { input_tokens: number; output_tokens: number }; thinking?: boolean } = {},
) {
  const content: unknown[] = []
  if (opts.thinking !== false) content.push({ type: 'thinking', thinking: '', signature: 'sig' })
  content.push({ type: 'text', text })
  return Response.json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason: opts.stop_reason ?? 'end_turn',
    stop_sequence: null,
    stop_details: opts.stop_reason === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
    usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...(opts.usage ?? { input_tokens: 700, output_tokens: 900 }) },
  })
}

export const anthropicError = (status: number, type: string) =>
  Response.json({ type: 'error', error: { type, message: 'test' } }, { status })
