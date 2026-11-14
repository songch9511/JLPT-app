import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import n1 from '../../public/data/words-n1.json'
import n5 from '../../public/data/words-n5.json'
import { WORD_COUNT } from '../src/generated/words'
import { cleanup } from '../src/index'
import { costMicros, dayKey, secondsUntilNextDay, worstCaseMicros } from '../src/quota'
import { lookupWord, WORD_ID_PATTERN } from '../src/words'
import { T0, testEnv } from './helpers'

describe('word data', () => {
  it('covers every word in public/data (8,130)', () => {
    expect(WORD_COUNT).toBe(8130)
  })

  it('ids are the stable ids the canonical files carry in each row (app docs/plan/08 §7)', () => {
    const rows5 = n5 as [string, string, string, string, string][]
    const rows1 = n1 as [string, string, string, string, string][]
    for (const i of [0, 1, 17, rows5.length - 1]) {
      const [id, w, r, ko, en] = rows5[i]!
      expect(lookupWord(id)).toEqual({ id, w, r, m: ko || en, l: 5 })
    }
    const [lastId, lastW] = rows1[rows1.length - 1]!
    expect(lookupWord(lastId)?.w).toBe(lastW)
    // N5's first word is w000; the counters run on through the levels without gaps today
    expect(rows5[0]![0]).toBe('w000')
    expect(lookupWord('w69u')).toBeUndefined() // the next id, not issued yet
    // positional ids of the app before stable ids are not word ids here
    expect(lookupWord('5-1')).toBeUndefined()
  })

  it('rejects ids outside the known format without touching the data', () => {
    for (const id of ['', 'w', 'w0', 'w00', 'W000', 'w0000', 'w00a1', 'w000 ', ' w000', 'xw000', 'w-01', 'w0_1', 'w1234567', '5-1', '0-1'])
      expect(WORD_ID_PATTERN.test(id)).toBe(false)
    for (const id of ['w000', 'w0k3', 'w69t', 'w1000', 'wzzzzzz']) expect(WORD_ID_PATTERN.test(id)).toBe(true)
  })
})

describe('day boundaries', () => {
  it('uses the configured offset (Korea: UTC+9)', () => {
    expect(dayKey(Date.UTC(2026, 10, 13, 14, 59, 59), 540)).toBe('2026-11-13')
    expect(dayKey(Date.UTC(2026, 10, 13, 15, 0, 0), 540)).toBe('2026-11-14')
    expect(dayKey(Date.UTC(2026, 10, 13, 15, 0, 0), 0)).toBe('2026-11-13')
  })

  it('counts seconds to the next local midnight', () => {
    expect(secondsUntilNextDay(Date.UTC(2026, 10, 13, 14, 59, 0), 540)).toBe(60)
    expect(secondsUntilNextDay(Date.UTC(2026, 10, 13, 15, 0, 0), 540)).toBe(86400)
  })
})

describe('cost', () => {
  it('prices Haiku 5.5 usage in micro-dollars, including cache reads/writes', () => {
    expect(costMicros('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(100_000) // $0.10
    expect(costMicros('claude-haiku-5-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(500_000) // $0.50
    expect(costMicros('claude-haiku-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 })).toBe(
      Math.ceil(1000 * 0.1 * 1.25 + 1000 * 0.1 * 0.1),
    )
  })

  it('the worst case covers the full max_tokens of output', () => {
    expect(worstCaseMicros('claude-haiku-5-5', 1000, 4096)).toBeGreaterThanOrEqual(4096 * 0.5)
    expect(() => costMicros('claude-unknown', { input_tokens: 1, output_tokens: 1 })).toThrow()
  })
})

describe('retention job', () => {
  it('deletes old usage rows and webhook ids, keeps recent ones', async () => {
    const e = testEnv()
    const old = dayKey(T0 - 40 * 86_400_000, 540)
    const recent = dayKey(T0, 540)
    await env.DB.batch([
      env.DB.prepare("INSERT INTO story_usage (user_hash, day, calls) VALUES ('h', ?1, 1), ('h', ?2, 1)").bind(old, recent),
      env.DB.prepare("INSERT INTO webhook_events (event_id, received_at) VALUES ('old', ?1), ('new', ?2)").bind(T0 - 31 * 86_400_000, T0),
    ])
    await cleanup(e, T0)
    const days = (await env.DB.prepare('SELECT day FROM story_usage').all<{ day: string }>()).results.map((r) => r.day)
    const ids = (await env.DB.prepare('SELECT event_id FROM webhook_events').all<{ event_id: string }>()).results.map((r) => r.event_id)
    expect(days).toEqual([recent])
    expect(ids).toEqual(['new'])
  })
})
