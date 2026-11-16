// Chapters (src/progress.ts): a level's words, 50 at a time in their introduction order (frequency). And Home's
// review line after a long break: "412장 중 100장" — every review due, and the day's capped share of them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boot, card, DAY } from './helpers'
import type { Row } from '../../src/data'

const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)

async function setup() {
  const b = await boot({ now: NOW })
  const data = await import('../../src/data')
  const progress = await import('../../src/progress')
  for (const l of data.LEVELS) {
    const rows = JSON.parse(readFileSync(new URL(`../../public/data/words-n${l}.json`, import.meta.url), 'utf8')) as Row[]
    data.setLevelInfo(l, rows.map((r, i) => data.parseRow(l, r, i)))
  }
  return { ...b, data, progress }
}

describe('chapters', () => {
  it('50 words each, in the level’s introduction order; the last one holds the rest', async () => {
    const { data } = await setup()
    expect(data.chapterCount(3)).toBe(43)
    expect(data.chapterIds(3, 1)).toEqual(data.levelInfo(3)!.order.slice(0, 50))
    expect(data.chapterIds(3, 22)).toEqual(data.levelInfo(3)!.order.slice(1050, 1100))
    expect(data.chapterIds(3, 43)).toHaveLength(2140 - 42 * 50)
    expect(data.chapterIds(5, 15)).toHaveLength(718 - 14 * 50)
  })

  it('a chapter is done once all its words were met; the current one holds the next new word', async () => {
    const { data, progress, store } = await setup()
    const order = data.levelInfo(3)!.order
    store.update((d) => void (d.cards = Object.fromEntries(order.slice(0, 1074).map((id) => [id, card({ due: T + DAY })]))))
    const s = store.getState()
    expect(progress.chaptersDone(s, 3)).toBe(21)
    expect(progress.currentChapter(s, 3)).toBe(22)
    expect(progress.chapterMet(s, 3, 22)).toBe(24)
    expect(progress.chapterDone(s, 3, 21)).toBe(true)
    expect(progress.chapterDone(s, 3, 22)).toBe(false)
    // a word met out of order counts for its own chapter
    store.update((d) => void (d.cards = { ...d.cards, [order[2000]]: card({ due: T + DAY }) }))
    expect(progress.chapterMet(store.getState(), 3, 41)).toBe(1)
    expect(progress.currentChapter(store.getState(), 3)).toBe(22)
  })
})

describe('the review cap after a long break', () => {
  it('Home says how many are due and how many are today’s: 412 due, the day’s share of them, new words cut to 5', async () => {
    const { srs, store } = await setup()
    const ids = (await import('../../src/data')).levelInfo(5)!.order
    const order4 = (await import('../../src/data')).levelInfo(4)!.order
    const all = [...ids, ...order4]
    store.update((d) => {
      d.onboarded = true
      d.settings = { ...d.settings, target: 4, includeLower: true, dailyNew: 20, dailyKanji: 10 }
      d.cards = Object.fromEntries(all.slice(0, 412).map((id, i) => [id, card({ due: T - (1 + (i % 9)) * DAY })]))
      // a slow pace measured before today: about 18 s an answer → a cap of 100
      d.log = { '2026-11-03': { c: 100, n: 0, r: 100, p: 90, ms: 1_800_000 } }
    })
    const s = store.getState()
    const q = srs.buildQueue(s, new Date(T))
    expect(srs.reviewsDue(s, new Date(T))).toBe(412)
    expect(q.review).toBe(100)
    expect(q.held).toBe(312)
    expect(q.fresh).toBe(srs.NEW_WHILE_BEHIND)
    expect(srs.buildQueue(s, new Date(T), undefined, { mode: 'kanji' }).fresh).toBe(srs.NEW_WHILE_BEHIND)
  })
})
