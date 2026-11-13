import { getEntitlement } from './entitlement'
import { config, defaultDeps, type Config, type Deps, type Env } from './env'
import {
  ApiError,
  checkOrigin,
  corsHeaders,
  errorResponse,
  json,
  log,
  type LogFields,
  preflight,
  readJson,
  withHeaders,
} from './http'
import { appUserIdFrom, hashId } from './identity'
import { dayKey, readUserQuota, spendToday } from './quota'
import { generateStory, MAX_BODY as STORY_MAX_BODY, parseStoryRequest } from './story'
import { handleWebhook } from './webhook'
import { WORDS_VERSION } from './words'

export type { Env } from './env'

const API_VERSION = 'v1'

type Ctx = { env: Env; cfg: Config; deps: Deps; fields: Partial<LogFields> }

async function limit(binding: RateLimit | undefined, key: string): Promise<void> {
  if (!binding) return
  const { success } = await binding.limit({ key })
  if (!success) throw new ApiError('rate_limited', 60)
}

async function limitByIp(request: Request, c: Ctx): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) await limit(c.env.RL_IP, `ip:${(await hashId(c.env, 'ip', ip)).slice(0, 32)}`)
}

/** Resolves the caller: validated app user id + its peppered hash, rate limited per IP and per user. */
async function caller(request: Request, c: Ctx): Promise<{ appUserId: string; userHash: string }> {
  await limitByIp(request, c)
  const appUserId = appUserIdFrom(request)
  const userHash = await hashId(c.env, 'user', appUserId)
  c.fields.user = userHash.slice(0, 8)
  await limit(c.env.RL_USER, `user:${userHash.slice(0, 32)}`)
  return { appUserId, userHash }
}

async function health(c: Ctx): Promise<Response> {
  let story: 'available' | 'paused' | 'unknown' = 'unknown'
  try {
    const { spent, reserved } = await spendToday(c.env, dayKey(c.deps.now(), c.cfg.dayOffsetMinutes))
    story = spent + reserved < c.cfg.spendCeilingMicros ? 'available' : 'paused'
  } catch {
    /* health stays up even if D1 is not */
  }
  return json({ status: 'ok', api: API_VERSION, words: WORDS_VERSION, story })
}

async function entitlement(request: Request, c: Ctx): Promise<Response> {
  const { appUserId, userHash } = await caller(request, c)
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  const ent = await getEntitlement(appUserId, userHash, c.env, c.cfg, c.deps, { refresh })
  const quota = await readUserQuota(c.env, c.cfg, userHash, dayKey(c.deps.now(), c.cfg.dayOffsetMinutes))
  return json({
    plus: ent.plus,
    // true when RevenueCat could not be reached and the last known state was used
    stale: ent.source === 'stored',
    story: ent.plus ? quota : { ...quota, remaining: 0 },
  })
}

async function story(request: Request, c: Ctx): Promise<Response> {
  const { appUserId, userHash } = await caller(request, c)
  const words = parseStoryRequest(await readJson(request, STORY_MAX_BODY), c.cfg)
  const ent = await getEntitlement(appUserId, userHash, c.env, c.cfg, c.deps)
  if (!ent.plus) throw new ApiError('not_entitled')
  const day = dayKey(c.deps.now(), c.cfg.dayOffsetMinutes)
  const r = await generateStory(words, userHash, day, c.env, c.cfg, c.deps)
  c.fields.inputTokens = r.usage.inputTokens
  c.fields.outputTokens = r.usage.outputTokens
  c.fields.costMicros = r.usage.costMicros
  return json({ story: r.story, usedWordIds: r.usedWordIds, quota: r.quota })
}

type Handler = (request: Request, c: Ctx) => Promise<Response>
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  [`/${API_VERSION}/health`]: { GET: (_r, c) => health(c) },
  [`/${API_VERSION}/entitlement`]: { GET: entitlement },
  [`/${API_VERSION}/story`]: { POST: story },
  [`/${API_VERSION}/webhooks/revenuecat`]: { POST: (r, c) => handleWebhook(r, c.env, c.cfg, c.deps) },
}

export async function handle(request: Request, env: Env, deps: Deps = defaultDeps()): Promise<Response> {
  const started = Date.now()
  const path = new URL(request.url).pathname
  const route = ROUTES[path]
  const c: Ctx = { env, cfg: config(env), deps, fields: {} }
  const { origin, ok: originOk } = checkOrigin(request, c.cfg.allowedOrigins)
  let res: Response
  let code: LogFields['code'] = 'ok'
  try {
    if (!originOk) throw new ApiError('forbidden_origin')
    if (request.method === 'OPTIONS' && route && origin) return preflight(origin)
    if (!route) throw new ApiError('not_found')
    const h = route[request.method]
    if (!h) {
      res = errorResponse(new ApiError('method_not_allowed'))
      res.headers.set('Allow', Object.keys(route).join(', '))
      code = 'method_not_allowed'
    } else {
      res = await h(request, c)
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('internal')
    if (!(e instanceof ApiError)) c.fields.detail = e instanceof Error ? e.name : 'unknown'
    code = err.code
    res = errorResponse(err)
  }
  log({ route: route ? path : 'unknown', status: res.status, ms: Date.now() - started, code, ...c.fields })
  return originOk ? withHeaders(res, corsHeaders(origin)) : res
}

/** Daily retention job: keeps only what the privacy notice promises. */
export async function cleanup(env: Env, now: number): Promise<void> {
  const cfg = config(env)
  const day = (daysAgo: number) => dayKey(now - daysAgo * 86_400_000, cfg.dayOffsetMinutes)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM story_usage WHERE day < ?1').bind(day(35)),
    env.DB.prepare('DELETE FROM webhook_events WHERE received_at < ?1').bind(now - 30 * 86_400_000),
    env.DB.prepare('DELETE FROM spend_daily WHERE day < ?1').bind(day(400)),
  ])
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: async (controller, env) => {
    await cleanup(env, controller.scheduledTime)
    log({ route: 'cron', status: 200, ms: 0, code: 'ok', event: 'cleanup' })
  },
} satisfies ExportedHandler<Env>
