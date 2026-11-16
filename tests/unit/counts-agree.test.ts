// QA round 2 (docs/plan/13): every user-visible count that more than one screen shows must agree, whatever the
// state. Home, Study (both `buildQueue`), the 기록 forecast, the level screen (word by word), the 단어장 level rows
// (`breakdowns`), Home's two session buttons (`buildQueue` by mode), the 기록 stamps (`studyProgress`), Home's catch-up days (`spreadReviews`) and the
// iOS widget payload are computed by different functions; this checks them against each other on states that exercise
// backlogs, reading cards (active, resting, re-tagged) and lower levels.
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
    Object.assign(d.settings, { target: 5, includeLower: true, dailyNew: 20, fastTrack: true, ...settings })
    d.cards = cards
    d.log = log
  })
  const data = await import('../../src/data')
  // the level data as the app loads it (order, S tags), every level
  for (const l of data.LEVELS) {
    const rows = JSON.parse(readFileSync(new URL(`../../public/data/words-n${l}.json`, import.meta.url), 'utf8')) as Row[]
    data.setLevelInfo(l, rows.map((r, i) => data.parseRow(l, r, i)))
  }
  const widget = await import('../../src/platform/widget')
  const reminders = await import('../../src/platform/reminders')
  return { ...b, data, widget, reminders }
}

type Env = Awaited<ReturnType<typeof setup>>

function agree({ store, srs, data, widget, reminders }: Env) {
  const s = store.getState()
  const now = new Date(T)
  const q = srs.buildQueue(s, now)
  const p = srs.studyProgress(s)
  const b = srs.breakdowns(s)
  const levels = srs.studyLevels(s.settings)

  // Home "복습 · 익히는 중 · 새 단어" = Study "남은 N장" = the widget's today = the reminder's today
  const today = reminders.workOn(s, new Date(2026, 10, 14), now)
  expect(today.reviews).toBe(q.review + q.learning)
  expect(today.fresh).toBe(q.fresh)
  const w = widget.widgetSnapshot(s, now)
  expect(w.days[0]).toMatchObject({ due: q.review + q.learning, fresh: q.fresh })
  // Home's two buttons (복습하기 · 새 단어) split exactly what the day holds: nothing twice, nothing left out
  const r = srs.buildQueue(s, now, undefined, { mode: 'review' })
  const n = srs.buildQueue(s, now, undefined, { mode: 'new' })
  expect({ review: r.review, fresh: r.fresh, held: r.held }).toEqual({ review: q.review, fresh: 0, held: q.held })
  expect({ review: n.review, fresh: n.fresh, freshReading: n.freshReading, held: n.held }).toEqual({ review: 0, fresh: q.fresh, freshReading: q.freshReading, held: q.held })
  expect(r.learning + n.learning).toBe(q.learning)
  expect(r.waiting + n.waiting).toBe(q.waiting)
  expect(srs.cardsLeft(r) + srs.cardsLeft(n)).toBe(srs.cardsLeft(q))
  // a session has a card to show exactly when it counts one that is ready, and the day's queue when either has
  expect(r.next === null).toBe(srs.cardsLeft(r) - r.waiting === 0)
  expect(n.next === null).toBe(srs.cardsLeft(n) - n.waiting === 0)
  expect(q.next === null).toBe(r.next === null && n.next === null)
  // Home's word card, the 기록 stamps and the widget: words of the studied levels, met, in long-term memory
  expect({ levels: w.levels, total: w.total, met: w.met, mature: w.mature }).toEqual({
    levels: levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`,
    total: p.total,
    met: p.met,
    mature: p.mature,
  })
  // the retired exam fields stay inert for a widget built before their removal
  expect({ plan: w.plan, goal: w.goal, examDate: w.examDate }).toEqual({ plan: null, goal: 0, examDate: '' })
  // the backlog stated on Home ("밀린 복습 …장", queue) and the one its catch-up days count from (spread)
  expect(srs.spreadReviews(s, now).held[0] ?? 0).toBe(q.held)
  // words not yet met: Home's "다음 급수" logic, the word card, and the level rows
  expect(p.total - p.met).toBe(srs.newWordsLeft(s))
  expect(p.total).toBe(levels.reduce((n, l) => n + data.COUNTS[l], 0))
  expect(p.met).toBe(levels.reduce((n, l) => n + data.COUNTS[l] - b[l].new, 0))
  expect(p.mature).toBe(levels.reduce((n, l) => n + b[l].mature, 0))
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
  return { q, p, f }
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

  it('N3 with and without lower levels, cards in N1 outside the studied levels', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 100; i++) {
      cards[L(`5-${i}`)] = due((i % 5) - 2)
      cards[L(`3-${i}`)] = due((i % 7) - 3)
      cards[L(`1-${i}`)] = due(-2)
    }
    agree(await setup({ target: 3 }, cards))
    agree(await setup({ target: 3, includeLower: false }, cards))
  })

  it('every level-data word that is S has its reading card counted once with its meaning card', async () => {
    const env = await setup({}, {})
    const fast = [...env.data.levelInfo(5 as Level)!.fast].slice(0, 30)
    env.store.update((d) => {
      d.cards = Object.fromEntries(fast.flatMap((id, i) => [[id, due(i % 3)], [id + ':r', due((i % 4) - 2)]]))
    })
    agree(env)
  })

  it('after a study session whose answers were re-graded (swiped back, grade changed)', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 40; i++) cards[L(`5-${i}`)] = due((i % 4) - 2, { lapses: i % 3 })
    const env = await setup({ dailyNew: 10 }, cards)
    const { Session } = await import('../../src/session')
    const session = new Session()
    // follow the queue as the study screen does, answering a mix of grades (reading cards: no 쉬워요)
    const grades = [3, 1, 4, 3, 3, 1, 3, 4, 3, 1, 3, 3, 4, 1, 3, 3, 3, 4, 1, 3] as const
    let last: string | undefined
    for (let i = 0; i < grades.length; i++) {
      const at = new Date(T - 30 * MIN + i * 40_000)
      const q = env.srs.buildQueue(env.store.getState(), at, last)
      if (!q.next) break
      const g = q.next.id.endsWith(':r') && grades[i] === 4 ? 3 : grades[i]
      session.answer({ id: q.next.id, kind: q.next.kind, grade: g as 1 | 3 | 4, at: at.getTime(), ms: 4000 })
      last = q.next.id
    }
    agree(env)
    // change grades in every direction, earliest first and last
    for (const [k, g] of [[1, 3], [0, 1], [5, 4], [2, 1], [session.length - 1, 1], [3, 3]] as const) {
      if (k >= session.length) continue
      const e = session.entries[k]
      session.regrade(k, (e.id.endsWith(':r') && g === 4 ? 3 : g) as 1 | 3 | 4)
      agree(env)
      // the day's log still counts exactly the answers the history holds
      const log = env.store.getState().log['2026-11-14']
      expect(log.c).toBe(session.length)
      expect(log.xp).toBe(env.store.getState().xp)
    }
  })
})

// Home's two sessions (srs.ts `StudyMode`): 복습하기 shows the reviews due today and the cards being relearned, 새 단어
// today's new words and the words still in their first learning steps. The number on each button is what its session
// then shows, the sessions never take each other's cards, and after both nothing of the day is left.
describe('the two sessions', () => {
  type Mode = 'review' | 'new'

  /** A day with both kinds of work: reviews due, a relearning card, a learning card from an earlier day, new words. */
  async function day(settings: Partial<State['settings']> = {}) {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 24; i++) cards[L(`5-${i}`)] = due((i % 4) - 2, { lapses: i % 3 })
    // forgotten in a review earlier today: comes back in the review session
    cards[L('5-30')] = card({ due: T + 2 * MIN, state: 3, scheduled_days: 0, lapses: 1, last_review: T - 8 * MIN })
    // introduced yesterday and still in its first steps: a new word still being learned
    cards[L('5-31')] = card({ due: T - 20 * HOUR, state: 1, scheduled_days: 0, reps: 1, last_review: T - 21 * HOUR })
    // …and one of each that comes back later today, beyond the learn-ahead window
    cards[L('5-32')] = card({ due: T + 3 * HOUR, state: 3, scheduled_days: 0, lapses: 2, last_review: T - 10 * MIN })
    cards[L('5-33')] = card({ due: T + 4 * HOUR, state: 1, scheduled_days: 0, reps: 1, last_review: T - 10 * MIN })
    return setup({ dailyNew: 6, ...settings }, cards)
  }

  /** Follow one session to its end as the study screen does (the cards that wait are finished now), 20 s a card. */
  function play(env: Env, mode: Mode, from: number, grades: readonly (1 | 3 | 4)[] = [3, 1, 3, 4, 3, 3, 1, 3]) {
    const shown = new Set<string>()
    const kinds = new Set<string>()
    let last: string | undefined
    let t = from
    for (let i = 0; i < 2000; i++) {
      const s = env.store.getState()
      const q = env.srs.buildQueue(s, new Date(t), last, { mode, finishNow: true })
      if (!q.next) return { shown, kinds, end: t, answers: i }
      const prev = s.cards[q.next.id]
      // what the session offers is its own: never a card of the other session
      if (mode === 'review') expect(prev && (prev.state === 2 || prev.state === 3), `${q.next.id} in 복습하기`).toBe(true)
      else expect(!prev || prev.state === 1, `${q.next.id} in 새 단어`).toBe(true)
      shown.add(q.next.id)
      kinds.add(q.next.kind)
      const g = grades[i % grades.length]
      env.srs.answer(q.next.id, q.next.id.endsWith(':r') && g === 4 ? 3 : g, new Date(t), 4000)
      last = q.next.id
      t += 20_000
    }
    throw new Error('the session did not end')
  }

  const counts = (env: Env, at: number) => {
    const s = env.store.getState()
    const q = (mode?: Mode) => env.srs.buildQueue(s, new Date(at), undefined, mode && { mode })
    return { all: q(), review: q('review'), fresh: q('new') }
  }

  for (const order of [['review', 'new'], ['new', 'review']] as const)
    it(`${order[0]} then ${order[1]}: each shows the cards its button counted, and together the whole day`, async () => {
      const env = await day()
      const before = counts(env, T)
      agree(env)
      expect(before.review.review).toBe(18)
      expect(before.review.learning).toBe(2)
      expect(before.fresh.fresh).toBe(6)
      expect(before.fresh.learning).toBe(2)

      const first = play(env, order[0], T)
      const mid = counts(env, first.end)
      // the session shown is finished; the other one's button still says what it said before
      expect(env.srs.cardsLeft(mid[order[0] === 'review' ? 'review' : 'fresh'])).toBe(0)
      const other = order[1] === 'review' ? 'review' : 'fresh'
      expect(env.srs.cardsLeft(mid[other])).toBe(env.srs.cardsLeft(before[other]))
      expect(first.shown.size).toBe(env.srs.cardsLeft(before[order[0] === 'review' ? 'review' : 'fresh']))

      const second = play(env, order[1], first.end)
      expect(second.shown.size).toBe(env.srs.cardsLeft(before[other]))
      // no card was shown by both, and nothing of the day is left: not for either session, not for the plain route
      expect([...first.shown].filter((id) => second.shown.has(id))).toEqual([])
      const after = counts(env, second.end)
      expect(env.srs.cardsLeft(after.all)).toBe(0)
      expect(after.all.next).toBeNull()

      const log = env.store.getState().log['2026-11-14']
      expect(log.n).toBe(6)
      expect(log.r).toBe(18)
      // the review session met reviews and their relearning steps only; the new one new words and their steps only
      const [rev, fresh] = order[0] === 'review' ? [first, second] : [second, first]
      expect([...rev.kinds].sort()).toEqual(['learning', 'review'])
      expect([...fresh.kinds].sort()).toEqual(['learning', 'new'])
    })

  it('the plain route still shows every card of both sessions in one queue', async () => {
    const env = await day()
    const before = counts(env, T)
    const shown = new Set<string>()
    let last: string | undefined
    let t = T
    for (let i = 0; i < 2000; i++) {
      const q = env.srs.buildQueue(env.store.getState(), new Date(t), last, { finishNow: true })
      if (!q.next) break
      shown.add(q.next.id)
      env.srs.answer(q.next.id, 3, new Date(t), 4000)
      last = q.next.id
      t += 20_000
    }
    expect(shown.size).toBe(env.srs.cardsLeft(before.all))
    expect(env.srs.cardsLeft(before.all)).toBe(env.srs.cardsLeft(before.review) + env.srs.cardsLeft(before.fresh))
  })

  it('a backlog: the review session stops at the day’s quota, the new one keeps the cut of new words', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 400; i++) cards[L(`5-${i}`)] = due(-1 - (i % 30))
    const env = await setup({ target: 4, dailyNew: 30 }, cards)
    const { q } = agree(env)
    expect(q.held).toBeGreaterThan(0)
    const before = counts(env, T)
    expect(before.fresh.fresh).toBe(env.srs.NEW_WHILE_BEHIND)
    const rev = play(env, 'review', T, [3])
    expect(rev.shown.size).toBe(before.review.review)
    // the held reviews are still held (none was let in by finishing today's), and the new words are untouched
    const mid = counts(env, rev.end)
    expect(mid.all.held).toBe(before.all.held)
    expect(mid.review.next).toBeNull()
    expect(mid.fresh.fresh).toBe(before.fresh.fresh)
    // "50장 더" lets reviews in: they are the review session's
    env.srs.unlockMoreReviews(50, new Date(rev.end))
    const more = counts(env, rev.end)
    expect(more.review.review).toBe(50)
    expect(more.fresh.review).toBe(0)
  })

  it('fast-track: a new word introduced with a reading card stays in the new session through its steps', async () => {
    const env = await setup({ dailyNew: 8 }, {})
    const before = counts(env, T)
    expect(before.fresh.freshReading).toBeGreaterThan(0)
    expect(env.srs.cardsLeft(before.review)).toBe(0)
    const n = play(env, 'new', T, [1, 3, 3])
    expect(n.shown.size).toBe(8)
    expect([...n.shown].some((id) => id.endsWith(':r'))).toBe(true)
    // nothing spilled into the review session
    expect(env.srs.cardsLeft(counts(env, n.end).review)).toBe(0)
    agree(env)
  })

  it('a session keeps its learning cards while they wait: counted on its own button, not the other’s', async () => {
    const env = await day({ dailyNew: 0 })
    const s = env.store.getState()
    const now = new Date(T)
    const r = env.srs.buildQueue(s, now, undefined, { mode: 'review' })
    const n = env.srs.buildQueue(s, now, undefined, { mode: 'new' })
    // 5-32 (relearning, in 3 h) waits for the review session; 5-33 (learning, in 4 h) for the new one
    expect({ waiting: r.waiting, nextDue: r.nextDue }).toEqual({ waiting: 1, nextDue: T + 3 * HOUR })
    expect({ waiting: n.waiting, nextDue: n.nextDue }).toEqual({ waiting: 1, nextDue: T + 4 * HOUR })
    // nothing new today, yet the new session still has its two learning cards: they are never dropped
    expect({ fresh: n.fresh, learning: n.learning }).toEqual({ fresh: 0, learning: 2 })
    expect(n.next).toEqual({ id: L('5-31'), kind: 'learning' })
  })
})
