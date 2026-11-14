// QA round 2 (docs/plan/13): every user-visible count that more than one screen shows must agree, whatever the
// state. Home, Study (both `buildQueue`), the 기록 forecast, the level screen (word by word), the 단어장 level rows
// (`breakdowns`), readiness and the iOS widget payload are computed by different functions; this checks them
// against each other on states that exercise backlogs, reading cards (active, resting, re-tagged), lower levels and
// the exam day.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boot, card, DAY, HOUR, L, MIN } from './helpers'
import type { SCard, State } from '../../src/store'
import type { Level, Row } from '../../src/data'

const NOW = '2026-11-14T09:00:00'
const T = Date.parse(NOW)

async function setup(settings: Partial<State['settings']>, cards: Record<string, SCard>, log: State['log'] = {}) {
  const b = await boot({ now: NOW })
  b.store.update((d) => {
    d.onboarded = true
    Object.assign(d.settings, { target: 5, includeLower: true, dailyNew: 20, examDate: '2026-12-06', fastTrack: true, ...settings })
    d.cards = cards
    d.log = log
  })
  const data = await import('../../src/data')
  // the level data as the app loads it (order, S tags), every level
  for (const l of data.LEVELS) {
    const rows = JSON.parse(readFileSync(new URL(`../../public/data/words-n${l}.json`, import.meta.url), 'utf8')) as Row[]
    data.setLevelInfo(l, rows.map((r, i) => data.parseRow(l, r, i)))
  }
  const readiness = await import('../../src/readiness')
  const widget = await import('../../src/platform/widget')
  const reminders = await import('../../src/platform/reminders')
  return { ...b, data, readiness, widget, reminders }
}

type Env = Awaited<ReturnType<typeof setup>>

function agree({ store, srs, data, readiness, widget, reminders }: Env) {
  const s = store.getState()
  const now = new Date(T)
  const q = srs.buildQueue(s, now)
  const r = readiness.readiness(s, now)
  const b = srs.breakdowns(s)
  const levels = srs.studyLevels(s.settings)

  // Home "복습 · 익히는 중 · 새 단어" = Study "남은 N장" = the widget's today = the reminder's today
  const today = reminders.workOn(s, new Date(2026, 10, 14), now)
  expect(today.reviews).toBe(q.review + q.learning)
  expect(today.fresh).toBe(q.fresh)
  const w = widget.widgetSnapshot(s, now)
  expect(w.days[0]).toMatchObject({ due: q.review + q.learning, fresh: q.fresh })
  // the headline figure on Home and in the widget
  expect(w.plan).toBe(r.past ? null : Math.round(r.plan))
  expect(w.total).toBe(r.total)
  // the backlog stated on Home ("밀린 복습 …장", queue) and the one the readiness plan assumes (spread)
  expect(r.held).toBe(q.held)
  // words not yet met: Home's "다음 급수" logic, readiness, and the level rows
  expect(r.unseen).toBe(srs.newWordsLeft(s))
  expect(r.total).toBe(levels.reduce((n, l) => n + data.COUNTS[l], 0))
  expect(r.total - r.unseen).toBe(levels.reduce((n, l) => n + data.COUNTS[l] - b[l].new, 0))
  // the level screen counts word by word (`wordStage`), the rows by card (`breakdowns`)
  for (const l of data.LEVELS) {
    const ids = data.levelInfo(l)!.order
    const per = { new: 0, learning: 0, young: 0, mature: 0 }
    for (const id of ids) per[srs.wordStage(s, id)]++
    expect(per, `N${l}`).toEqual(b[l])
  }
  // 기록 "오늘" forecast: everything due by tonight — today's queue, what is held for later days, and learning cards
  // that come back later today — never fewer than Home shows
  const f = srs.forecast(s, now)
  expect(f[0]).toBeGreaterThanOrEqual(q.review + q.learning + q.held)
  // the widget's and the reminder's tomorrow (nothing studied before then) = what Home will show tomorrow morning
  const morning = new Date(2026, 10, 15, 9)
  const tq = srs.buildQueue(s, morning)
  const tomorrow = reminders.workOn(s, new Date(2026, 10, 15), now)
  expect(w.days[1]).toMatchObject({ due: tomorrow.reviews, fresh: tomorrow.fresh })
  expect({ reviews: tomorrow.reviews, fresh: tomorrow.fresh }).toEqual({ reviews: tq.review + tq.learning, fresh: tq.fresh })
  return { q, r, f }
}

const due = (offsetDays: number, extra: Partial<SCard> = {}) => card({ due: T + offsetDays * DAY, ...extra })

describe('counts agree across screens', () => {
  it('a new learner', async () => {
    agree(await setup({}, {}))
  })

  it('mid-way: reviews, learning cards later today, reading cards, a word with both cards', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 120; i++) cards[L(`5-${i}`)] = due((i % 9) - 4, { scheduled_days: i % 40, lapses: i % 3 })
    cards[L('5-130')] = card({ due: T + 3 * HOUR, state: 1, scheduled_days: 0, last_review: T - 10 * MIN })
    cards[L('5-131')] = card({ due: T + 5 * MIN, state: 3, scheduled_days: 0, last_review: T - 5 * MIN })
    // both cards of one word due today: one waits (sibling burying)
    cards[L('5-1') + ':r'] = due(-1)
    agree(await setup({}, cards))
  })

  it('a backlog spread over the coming days', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 600; i++) cards[L(`${i < 400 ? 5 : 4}-${i % 400}`)] = due(-1 - (i % 30))
    const { q } = agree(await setup({ target: 4, dailyNew: 30 }, cards))
    expect(q.held).toBeGreaterThan(0)
  })

  it('fast-track off: reading cards rest', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 50; i++) cards[L(`5-${i}`) + ':r'] = due(-1)
    for (let i = 50; i < 80; i++) cards[L(`5-${i}`)] = due(1)
    agree(await setup({ fastTrack: false }, cards))
  })

  it('N3 with lower levels, cards in N1 outside the studied levels, the exam day and after it', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 100; i++) {
      cards[L(`5-${i}`)] = due((i % 5) - 2)
      cards[L(`3-${i}`)] = due((i % 7) - 3)
      cards[L(`1-${i}`)] = due(-2)
    }
    agree(await setup({ target: 3 }, cards))
    agree(await setup({ target: 3, examDate: '2026-11-14' }, cards))
    agree(await setup({ target: 3, examDate: '2026-11-01' }, cards))
  })

  it('every level-data word that is S has its reading card counted once with its meaning card', async () => {
    const env = await setup({}, {})
    const fast = [...env.data.levelInfo(5 as Level)!.fast].slice(0, 30)
    env.store.update((d) => {
      d.cards = Object.fromEntries(fast.flatMap((id, i) => [[id, due(i % 3)], [id + ':r', due((i % 4) - 2)]]))
    })
    agree(env)
  })
})
