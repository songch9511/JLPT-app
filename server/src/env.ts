/** Bindings, vars and secrets the Worker expects (see wrangler.jsonc and README.md). */
export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  /** Workers Rate Limiting bindings. Optional so a missing binding degrades to "no limit", never to a crash. */
  RL_IP?: RateLimit
  RL_USER?: RateLimit

  // vars
  ALLOWED_ORIGINS?: string
  RC_ENTITLEMENT_ID?: string
  ACCEPT_SANDBOX_EVENTS?: string
  ENTITLEMENT_CACHE_TTL_SECONDS?: string
  STORY_MODEL?: string
  STORY_EFFORT?: string
  STORY_MAX_TOKENS?: string
  STORY_MAX_WORDS?: string
  STORY_DAILY_LIMIT?: string
  STORY_DAILY_ATTEMPT_LIMIT?: string
  GLOBAL_DAILY_SPEND_LIMIT_USD?: string
  DAY_OFFSET_MINUTES?: string
  ANTHROPIC_TIMEOUT_MS?: string
  REVENUECAT_TIMEOUT_MS?: string

  // secrets
  ANTHROPIC_API_KEY?: string
  REVENUECAT_SECRET_KEY?: string
  REVENUECAT_WEBHOOK_AUTH?: string
  USER_ID_PEPPER?: string
}

export type Effort = 'low' | 'medium' | 'high'

export interface Config {
  allowedOrigins: Set<string>
  entitlementId: string
  acceptSandboxEvents: boolean
  entitlementCacheTtl: number
  storyModel: string
  storyEffort: Effort
  storyMaxTokens: number
  storyMaxWords: number
  storyDailyLimit: number
  storyDailyAttemptLimit: number
  /** global daily ceiling in micro-dollars (1e-6 USD) */
  spendCeilingMicros: number
  dayOffsetMinutes: number
  anthropicTimeoutMs: number
  revenueCatTimeoutMs: number
}

function int(v: string | undefined, def: number, min: number, max: number): number {
  const n = v === undefined || v.trim() === '' ? def : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function config(env: Env): Config {
  const effort = env.STORY_EFFORT
  const spendUsd = Number(env.GLOBAL_DAILY_SPEND_LIMIT_USD ?? '5')
  return {
    allowedOrigins: new Set(
      (env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    entitlementId: env.RC_ENTITLEMENT_ID?.trim() || 'plus',
    acceptSandboxEvents: env.ACCEPT_SANDBOX_EVENTS === 'true',
    // KV rejects expirationTtl below 60 seconds.
    entitlementCacheTtl: int(env.ENTITLEMENT_CACHE_TTL_SECONDS, 300, 60, 3600),
    storyModel: env.STORY_MODEL?.trim() || 'claude-haiku-5-5',
    storyEffort: effort === 'medium' || effort === 'high' ? effort : 'low',
    storyMaxTokens: int(env.STORY_MAX_TOKENS, 4096, 1024, 16000),
    storyMaxWords: int(env.STORY_MAX_WORDS, 12, 1, 20),
    storyDailyLimit: int(env.STORY_DAILY_LIMIT, 1, 0, 50),
    storyDailyAttemptLimit: int(env.STORY_DAILY_ATTEMPT_LIMIT, 4, 1, 100),
    spendCeilingMicros: Number.isFinite(spendUsd) && spendUsd >= 0 ? Math.round(spendUsd * 1e6) : 5e6,
    dayOffsetMinutes: int(env.DAY_OFFSET_MINUTES, 540, -720, 840),
    anthropicTimeoutMs: int(env.ANTHROPIC_TIMEOUT_MS, 30000, 1000, 120000),
    revenueCatTimeoutMs: int(env.REVENUECAT_TIMEOUT_MS, 5000, 500, 30000),
  }
}

/** Things tests replace: the clock and the outbound fetch (RevenueCat, Anthropic). */
export interface Deps {
  now: () => number
  fetch: typeof fetch
}

export const defaultDeps = (): Deps => ({
  now: () => Date.now(),
  // looked up at call time so a test's global fetch mock also applies
  fetch: (input, init) => globalThis.fetch(input, init),
})
