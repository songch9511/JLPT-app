import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASSUMED_OUTPUT, cost, heuristicTokens, profile, scenarios } from '../lib/cost.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const base = { n: 1000, prefix: 2000, user: 100, output: 800, model: 'claude-sonnet-5-5' }

test('batch cost with a 1h cache at 50% hit rate (hand-computed)', () => {
  // per request: write 1000×$4 + read 1000×$0.10 + input 100×$2 + output 800×$10 = 12,300 µ$ → ×0.5 batch
  const c = cost({ ...base, hitRate: 0.5, ttl: '1h' })
  near(c.perWord, 0.00615)
  near(c.usd, 6.15)
  near(c.parts.output, 4)
  near(c.parts.cacheWrite, 2)
  near(c.parts.cacheRead, 0.05)
  near(c.parts.input, 0.1)
})

test('no cache, 5m TTL, below the minimum cacheable prefix, and standard (non-batch) price', () => {
  near(cost({ ...base, hitRate: 0, cache: false }).usd, 6.1) // (2100×2 + 800×10) × 0.5 × 1000 / 1e6
  near(cost({ ...base, hitRate: 0, ttl: '5m' }).usd, 6.6) // (2000×2.5 + 100×2 + 8000) × 0.5
  near(cost({ ...base, prefix: 400, hitRate: 0.9 }).usd, cost({ ...base, prefix: 400, hitRate: 0, cache: false }).usd)
  near(cost({ ...base, hitRate: 0.5, batch: false }).usd, 12.3)
  near(cost({ ...base, hitRate: 1, model: 'claude-haiku-5-5' }).usd, (2000 * 0.01 + 100 * 0.1 + 800 * 0.5) * 0.5 * 1000 / 1e6)
  assert.throws(() => cost({ ...base, hitRate: 0, model: 'nope' }))
})

test('scenarios add the retry share and order worst → best', () => {
  const rows = scenarios({ prefix: 2000, user: 100, output: 800 }, 1000, 'claude-sonnet-5-5', { retryShare: 0.05 })
  assert.equal(rows.length, 4)
  near(rows[1].usd, cost({ ...base, n: 1050, hitRate: 0.5, ttl: '1h' }).usd)
  assert.ok(rows[0].usd > rows[1].usd && rows[1].usd > rows[2].usd)
})

test('profile prefers measured usage over counted over heuristic, and says which', () => {
  const h = { prefix: 2391, user: 89 }
  const p0 = profile({ heuristic: h })
  assert.deepEqual([p0.prefix, p0.user, p0.output], [2391, 89, ASSUMED_OUTPUT])
  assert.equal(p0.source.output, 'assumed (01 §4.2)')
  const p1 = profile({ heuristic: h, tokenCount: { n: 20, prefix: 1800, meanTotal: 1890 } })
  assert.deepEqual([p1.prefix, p1.user], [1800, 90])
  assert.match(p1.source.prefix, /^counted/)
  const usage = [
    { status: 'ok', input: 80, cacheWrite: 1900, cacheRead: 0, output: 600, thinking: 100, ms: 9000 },
    { status: 'ok', input: 100, cacheWrite: 0, cacheRead: 1900, output: 800, thinking: 200, ms: 11000 },
    { status: 'refusal', input: 90, cacheWrite: 0, cacheRead: 1900, output: 5, thinking: 0, ms: 1000 },
  ]
  const p2 = profile({ heuristic: h, usage })
  assert.deepEqual([p2.prefix, p2.user, p2.output, p2.thinking, p2.latencyMs], [1900, 90, 700, 150, 10000])
  assert.match(p2.source.output, /^measured \(2/)
})

test('heuristic tokens: ASCII ≈ 4 chars/token, CJK ≈ 1 token/char', () => {
  assert.equal(heuristicTokens('abcd'), 1)
  assert.equal(heuristicTokens('学生です'), 4)
  assert.equal(heuristicTokens('학생 ab'), 3)
})
