import type { Config, Env } from './env'

/** Local calendar day (YYYY-MM-DD) for `DAY_OFFSET_MINUTES` (default +540 = Korea). */
export function dayKey(now: number, offsetMinutes: number): string {
  return new Date(now + offsetMinutes * 60_000).toISOString().slice(0, 10)
}

/** Seconds until the next local midnight (used for Retry-After on the daily cap). */
export function secondsUntilNextDay(now: number, offsetMinutes: number): number {
  const local = now + offsetMinutes * 60_000
  const next = Math.floor(local / 86_400_000 + 1) * 86_400_000
  return Math.ceil((next - local) / 1000)
}

// ---- prices ----

/** USD per million tokens. Source: Anthropic pricing (see README). Unknown model -> refuse to run. */
const PRICES: Record<string, { input: number; output: number }> = {
  // Haiku 5.5 rate for prompts up to 100K tokens; ours are ~1K.
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
}

export const priceOf = (model: string) => PRICES[model]

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Micro-dollars, rounded up. Cache writes 1.25x input, cache reads 0.1x input. */
export function costMicros(model: string, u: Usage): number {
  const p = PRICES[model]
  if (!p) throw new Error('unpriced model')
  const input =
    u.input_tokens * p.input + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 + (u.cache_read_input_tokens ?? 0) * p.input * 0.1
  return Math.ceil(input + u.output_tokens * p.output)
}

/** Worst case for one call: generous input estimate plus the full max_tokens of output. */
export function worstCaseMicros(model: string, promptChars: number, maxTokens: number): number {
  // Japanese/Korean text is at most ~1 token per character; +1500 for system prompt and output schema.
  return costMicros(model, { input_tokens: promptChars + 1500, output_tokens: maxTokens })
}

// ---- per-user daily cap ----

export interface UserQuota {
  limit: number
  used: number
  remaining: number
}

export async function readUserQuota(env: Env, cfg: Config, userHash: string, day: string): Promise<UserQuota> {
  const row = await env.DB.prepare('SELECT calls FROM story_usage WHERE user_hash = ?1 AND day = ?2')
    .bind(userHash, day)
    .first<{ calls: number }>()
  const used = row?.calls ?? 0
  return { limit: cfg.storyDailyLimit, used, remaining: Math.max(0, cfg.storyDailyLimit - used) }
}

/**
 * Atomically takes one story from today's allowance. Counting happens before the model call so
 * two concurrent requests cannot both pass a cap of 1. Returns null when the cap (or the attempt
 * cap, which bounds retries after failures) is reached.
 */
export async function reserveUserStory(env: Env, cfg: Config, userHash: string, day: string): Promise<UserQuota | null> {
  if (cfg.storyDailyLimit < 1) return null
  const row = await env.DB.prepare(
    `INSERT INTO story_usage (user_hash, day, calls, attempts) VALUES (?1, ?2, 1, 1)
     ON CONFLICT (user_hash, day) DO UPDATE SET calls = calls + 1, attempts = attempts + 1
     WHERE story_usage.calls < ?3 AND story_usage.attempts < ?4
     RETURNING calls`,
  )
    .bind(userHash, day, cfg.storyDailyLimit, cfg.storyDailyAttemptLimit)
    .first<{ calls: number }>()
  if (!row) return null
  return { limit: cfg.storyDailyLimit, used: row.calls, remaining: Math.max(0, cfg.storyDailyLimit - row.calls) }
}

/** Gives the story back after a failure that was not the user's doing (the attempt still counts). */
export async function refundUserStory(env: Env, userHash: string, day: string): Promise<void> {
  await env.DB.prepare('UPDATE story_usage SET calls = MAX(0, calls - 1) WHERE user_hash = ?1 AND day = ?2')
    .bind(userHash, day)
    .run()
}

// ---- global daily spend ceiling ----

/** Reserves the worst-case cost of one call; false when it would cross the ceiling. */
export async function reserveSpend(env: Env, cfg: Config, day: string, micros: number): Promise<boolean> {
  const [, res] = await env.DB.batch([
    env.DB.prepare('INSERT INTO spend_daily (day) VALUES (?1) ON CONFLICT (day) DO NOTHING').bind(day),
    env.DB.prepare(
      `UPDATE spend_daily SET reserved_micros = reserved_micros + ?2
       WHERE day = ?1 AND spent_micros + reserved_micros + ?2 <= ?3
       RETURNING day`,
    ).bind(day, micros, cfg.spendCeilingMicros),
  ])
  return (res?.results.length ?? 0) > 0
}

/** Releases the reservation and books what the call actually cost (0 if it was never billed). */
export async function settleSpend(
  env: Env,
  day: string,
  reserved: number,
  actual: { micros: number; inputTokens: number; outputTokens: number; ok: boolean },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE spend_daily SET
       reserved_micros = MAX(0, reserved_micros - ?2),
       spent_micros = spent_micros + ?3,
       input_tokens = input_tokens + ?4,
       output_tokens = output_tokens + ?5,
       calls = calls + 1,
       failures = failures + ?6
     WHERE day = ?1`,
  )
    .bind(day, reserved, actual.micros, actual.inputTokens, actual.outputTokens, actual.ok ? 0 : 1)
    .run()
}

export async function spendToday(env: Env, day: string): Promise<{ spent: number; reserved: number }> {
  const row = await env.DB.prepare('SELECT spent_micros, reserved_micros FROM spend_daily WHERE day = ?1')
    .bind(day)
    .first<{ spent_micros: number; reserved_micros: number }>()
  return { spent: row?.spent_micros ?? 0, reserved: row?.reserved_micros ?? 0 }
}
