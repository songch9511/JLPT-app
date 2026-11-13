// Token and cost estimate. Three sources, best first, and the printout says which one each number came from:
//   measured  — usage.json from real responses (the --sample run): input, cache write/read, output, thinking
//   counted   — token-count.json from the count_tokens endpoint (input only; output cannot be counted ahead)
//   heuristic — character counts below; only for a first idea, ±30% or worse
// Output tokens are only ever measured (sample) or assumed (01-business-model.md §4.2: ~800 incl. thinking).

import { PRICES } from './config.mjs'

export const MIN_CACHEABLE = 512 // Sonnet 5.5 / Haiku 5.5 / Opus 5.5 minimum cacheable prefix (claude-api skill, prompt-caching)
export const ASSUMED_OUTPUT = 800

/** Rough token count without a tokenizer: ASCII ≈ 4 chars/token, CJK/Hangul ≈ 1 token/char. */
export function heuristicTokens(s) {
  let ascii = 0, other = 0
  for (const c of s) c.charCodeAt(0) < 128 ? ascii++ : other++
  return Math.ceil(ascii / 4 + other)
}

/**
 * Batch cost of n requests.
 * @param {{ n: number, prefix: number, user: number, output: number, hitRate: number, model: string,
 *           batch?: boolean, ttl?: '5m'|'1h', cache?: boolean }} a
 *   prefix: tokens of the shared cached prefix (system + schema) per request; user: per-word uncached input
 */
export function cost(a) {
  const p = PRICES.models[a.model]
  if (!p) throw new Error(`no price for ${a.model}`)
  const disc = a.batch === false ? 1 : PRICES.batchDiscount
  const cacheable = a.cache !== false && a.prefix >= MIN_CACHEABLE
  const hit = cacheable ? a.hitRate : 0
  const write = cacheable ? a.prefix * (1 - hit) : 0
  const read = cacheable ? a.prefix * hit : 0
  const plainIn = a.user + (cacheable ? 0 : a.prefix)
  const writePrice = a.ttl === '5m' ? p.write5m : p.write1h
  const per = (plainIn * p.input + write * writePrice + read * p.cacheRead + a.output * p.output) / 1e6
  const usd = per * a.n * disc
  return {
    usd,
    perWord: per * disc,
    parts: {
      input: (plainIn * p.input * a.n * disc) / 1e6,
      cacheWrite: (write * writePrice * a.n * disc) / 1e6,
      cacheRead: (read * p.cacheRead * a.n * disc) / 1e6,
      output: (a.output * p.output * a.n * disc) / 1e6,
    },
  }
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/** Per-request token profile from the best available source. */
export function profile({ usage = [], tokenCount = null, heuristic }) {
  const ok = usage.filter((u) => u.status === 'ok' || u.status === 'invalid')
  const out = { source: {}, prefix: heuristic.prefix, user: heuristic.user, output: ASSUMED_OUTPUT, thinking: null, latencyMs: null, n: ok.length }
  out.source = { prefix: 'heuristic', user: 'heuristic', output: 'assumed (01 §4.2)' }
  if (tokenCount) {
    out.prefix = tokenCount.prefix
    out.user = tokenCount.meanTotal - tokenCount.prefix
    out.source.prefix = out.source.user = `counted (count_tokens, ${tokenCount.n} words)`
  }
  if (ok.length) {
    const prefixes = ok.map((u) => u.cacheWrite + u.cacheRead).filter((x) => x > 0)
    if (prefixes.length) (out.prefix = mean(prefixes)), (out.source.prefix = `measured (${prefixes.length} responses)`)
    out.user = mean(ok.map((u) => u.input))
    out.source.user = `measured (${ok.length} responses)`
    out.output = mean(ok.map((u) => u.output))
    out.source.output = `measured (${ok.length} responses)`
    const th = ok.map((u) => u.thinking).filter((x) => x != null)
    out.thinking = th.length ? mean(th) : null
    const ms = ok.map((u) => u.ms).filter((x) => x != null)
    out.latencyMs = ms.length ? mean(ms) : null
  }
  return out
}

/** Scenario table: cache hit rates on the shared prefix are best-effort inside a batch, so show a range. */
export function scenarios(prof, n, model, { retryShare = 0.05, ttl = '1h' } = {}) {
  const rows = []
  for (const [label, hitRate] of [['캐시 적중 0% (최악: 매번 1h 캐시 쓰기)', 0], ['캐시 적중 50%', 0.5], ['캐시 적중 90%', 0.9]]) {
    const c = cost({ n: Math.ceil(n * (1 + retryShare)), prefix: prof.prefix, user: prof.user, output: prof.output, hitRate, model, ttl })
    rows.push({ label, ...c })
  }
  rows.push({ label: '참고: 캐시 끔', ...cost({ n: Math.ceil(n * (1 + retryShare)), prefix: prof.prefix, user: prof.user, output: prof.output, hitRate: 0, model, cache: false }) })
  return rows
}
