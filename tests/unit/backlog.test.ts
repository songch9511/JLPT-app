import { describe, expect, it } from 'vitest'
import { at, boot, bootUser, card, DAY, HOUR, MIN, L, legacyKeys } from './helpers'
import type { DayLog, SCard, State } from '../../src/store'

// Friday 2026-11-13 09:00 in Seoul; the default exam is Sunday 2026-12-06 (D-23)
const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)
const EXAM = Date.parse('2026-12-06T09:00:00')
const EOD = Date.parse('2026-11-14T00:00:00')
const log = (p: Partial<DayLog>): DayLog => ({ c: 0, n: 0, r: 0, p: 0, ...p })

/** `n` review cards of a level (N5 unless said) that came due one minute apart, the oldest `daysAgo` days ago. */
function overdue(n: number, daysAgo = 7, from = 0, level = 5): Record<string, SCard> {
  const out: Record<string, SCard> = {}
  for (let i = 0; i < n; i++) {
    const due = T - daysAgo * DAY + i * MIN
    out[L(`${level}-${from + i}`)] = card({ due, last_review: due - 6 * DAY, stability: 6, scheduled_days: 6 })
  }
  return out
}

async function setup(cards: Record<string, SCard>, settings: Partial<State['settings']> = {}, extra: Partial<State> = {}) {
  const b = await bootUser(NOW, { target: 5, includeLower: false, dailyNew: 20, examDate: '2026-12-06', ...settings }, { cards, ...extra })
  const rd = await import('../../src/readiness')
  const pj = await import('../../src/projection')
  return { ...b, rd, pj }
}

describe('the daily review cap', () => {
  it('30 minutes at the pace measured before today (225 at the default 8 s), never under 50', async () => {
    const { srs, store } = await setup({})
    expect(srs.reviewCap(store.getState(), at(NOW))).toBe(225)
    // today's own answers do not move today's cap
    store.update((d) => void (d.log = { '2026-11-13': log({ c: 100, ms: 100 * 3000 }) }))
    expect(srs.reviewCap(store.getState(), at(NOW))).toBe(225)
    // yesterday 4 s an answer → 450; a very slow pace → the floor
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 100, ms: 100 * 4000 }) }))
    expect(srs.reviewCap(store.getState(), at(NOW))).toBe(450)
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 100, ms: 100 * 60_000 }) }))
    expect(srs.reviewCap(store.getState(), at(NOW))).toBe(srs.MIN_REVIEW_CAP)
  })
})

describe('buildQueue with a backlog', () => {
  it('no backlog up to the cap: everything due is today’s and new words are as set', async () => {
    const { srs, store } = await setup(overdue(225))
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ review: 225, held: 0, fresh: 20 })
  })

  it('one over the cap: the oldest 225 today, the rest held, new words cut to 5', async () => {
    const { srs, store } = await setup(overdue(226))
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ review: 225, held: 1, fresh: srs.NEW_WHILE_BEHIND })
  })

  it('300 due: today is the oldest 225; nothing about the cards is changed', async () => {
    const cards = overdue(300)
    const { srs, store, rd } = await setup(cards, { dailyNew: 0 })
    const before = structuredClone(store.getState().cards)
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ review: 225, held: 75, next: { id: L('5-0'), kind: 'review' } })
    const sp = srs.spreadReviews(store.getState(), at(NOW))
    const today = [...sp.day].filter(([, d]) => d === 0).map(([id]) => id)
    expect(today.length).toBe(225)
    const oldest = new Set(Object.keys(cards).slice(0, 225))
    expect(today.every((id) => oldest.has(id))).toBe(true)
    rd.readiness(store.getState(), at(NOW))
    // a selection policy, not a rewrite: due dates and every other field stay as they were
    expect(store.getState().cards).toEqual(before)
  })

  it('the quota counts review answers already given today; “더 하기” lets more in', async () => {
    const { srs, store } = await setup(overdue(300), { dailyNew: 0 })
    // 225 reviews answered today (as if the oldest had been done): the day's share is finished
    store.update((d) => {
      const cards = { ...d.cards }
      for (let i = 0; i < 225; i++) cards[L(`5-${i}`)] = { ...cards[L(`5-${i}`)], due: T + 9 * DAY, last_review: T, state: 2 }
      d.cards = cards
      d.log = { '2026-11-13': log({ c: 225, r: 225, p: 200 }) }
    })
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ review: 0, held: 75, next: null, waiting: 0 })
    // the day counts as done: the quest is complete
    expect(srs.quests(store.getState(), at(NOW))[0].done).toBe(true)
    srs.unlockMoreReviews(srs.MORE_REVIEWS, at(NOW))
    expect(store.getState().log['2026-11-13'].xr).toBe(50)
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ review: 50, held: 25 })
    srs.unlockMoreReviews(-50, at(NOW))
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ review: 0, held: 75 })
  })

  it('learning cards are never held', async () => {
    const cards = overdue(300)
    for (let i = 0; i < 5; i++) cards[L(`5-${400 + i}`)] = card({ due: T - MIN, state: 1, scheduled_days: 0 })
    const { srs, store } = await setup(cards, { dailyNew: 0 })
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ learning: 5, review: 225, held: 75 })
  })
})

describe('new words while catching up', () => {
  it('at most NEW_WHILE_BEHIND a day; extras unlocked by the learner still count; a smaller setting stays', async () => {
    const { srs, store } = await setup({})
    const s = () => store.getState()
    expect(srs.newLeftToday(s(), at(NOW), 20, true)).toBe(5)
    expect(srs.newLeftToday(s(), at(NOW), 3, true)).toBe(3)
    expect(srs.newLeftToday(s(), at(NOW), 20, false)).toBe(20)
    store.update((d) => void (d.log = { '2026-11-13': log({ c: 2, n: 2, x: 10 }) }))
    expect(srs.newLeftToday(s(), at(NOW), 20, true)).toBe(5 + 10 - 2)
  })
})

describe('spreading over the coming days', () => {
  it('600 overdue at 225 a day: 225 · 225 · 150, caught up in 3 days; skipping today makes it 4', async () => {
    const { srs, store } = await setup(overdue(600))
    const sp = srs.spreadReviews(store.getState(), at(NOW))
    const per = [0, 0, 0, 0]
    for (const d of sp.day.values()) per[d]++
    expect(per).toEqual([225, 225, 150, 0])
    expect(sp.held.slice(0, 3)).toEqual([375, 150, 0])
    expect(sp.catchUp).toBe(3)
    const skip = srs.spreadReviews(store.getState(), at(NOW), 0)
    expect(skip.held.slice(0, 4)).toEqual([600, 375, 150, 0])
    expect(skip.catchUp).toBe(4)
  })

  it('cards coming due meanwhile queue behind the older ones (oldest due first)', async () => {
    const cards = overdue(600)
    for (let i = 0; i < 100; i++) cards[L(`5-${600 + i}`)] = card({ due: EOD + HOUR + i * MIN, last_review: EOD - 5 * DAY, stability: 6, scheduled_days: 6 })
    const { srs, store } = await setup(cards)
    const sp = srs.spreadReviews(store.getState(), at(NOW))
    // day 1: the remaining 375 old ones first (225 of them); the 100 new ones wait with 150 old ones
    expect(sp.held.slice(0, 4)).toEqual([375, 250, 25, 0])
    expect(sp.catchUp).toBe(4)
    expect(sp.day.get(L('5-600'))).toBe(2)
  })

  it('nothing held: catch-up is 0 and every card is on its due day', async () => {
    const cards = overdue(10)
    cards[L('5-50')] = card({ due: EOD + 3 * DAY + HOUR, last_review: T - DAY, stability: 4, scheduled_days: 4 })
    const { srs, store } = await setup(cards)
    const sp = srs.spreadReviews(store.getState(), at(NOW))
    expect(sp.catchUp).toBe(0)
    expect(sp.day.get(L('5-0'))).toBe(0)
    expect(sp.day.get(L('5-50'))).toBe(4)
  })
})

describe('readiness uses the same policy', () => {
  it('held reviews and the catch-up days agree with the queue', async () => {
    const { srs, store, rd } = await setup(overdue(600))
    const q = srs.buildQueue(store.getState(), at(NOW))
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.held).toBe(q.held)
    expect(r.catchUp).toBe(srs.spreadReviews(store.getState(), at(NOW)).catchUp)
  })

  it('new words in the plan follow the catching-up rule: exam in 3 days → 5 + 5 + 20, not 3 × 20', async () => {
    const { store, rd } = await setup(overdue(600), { examDate: '2026-11-16' })
    expect(rd.readiness(store.getState(), at(NOW))).toMatchObject({ daysLeft: 3, plannedNew: 30 })
    const calm = await setup(overdue(100), { examDate: '2026-11-16' })
    expect(calm.rd.readiness(calm.store.getState(), at(NOW)).plannedNew).toBe(60)
  })
})

describe('“오늘 하면 +N”: plan with today against today skipped (multi-step)', () => {
  it('one card due today, no new words: the card’s value reviewed today minus reviewed tomorrow', async () => {
    const c = card({ due: T - HOUR, last_review: T - 5 * DAY, stability: 4, difficulty: 6, scheduled_days: 4 })
    const { store, rd, pj } = await setup({ [L('5-0')]: c }, { dailyNew: 0 })
    const r = rd.readiness(store.getState(), at(NOW))
    const today = pj.examRecall(c, T, EXAM)
    const tomorrow = pj.examRecall(c, EOD, EXAM)
    expect(r.plan).toBeCloseTo(today, 9)
    expect(r.todayGain).toBeCloseTo(Math.max(0, today - tomorrow), 9)
    expect(r.todayGainReviews).toBeCloseTo(r.todayGain, 9)
  })

  it('no cards: today’s gain is today’s new words', async () => {
    const { store, rd } = await setup({}, { dailyNew: 10 })
    const pnew = await import('../../src/pnew')
    expect(rd.readiness(store.getState(), at(NOW)).todayGain).toBeCloseTo(10 * pnew.pNew(23), 9)
  })

  it('exam tomorrow: skipping leaves today’s reviews undone, so the gain is the review against none', async () => {
    const c = card({ due: T - HOUR, last_review: T - 5 * DAY, stability: 3, scheduled_days: 4 })
    const { store, rd, pj } = await setup({ [L('5-0')]: c }, { dailyNew: 0, examDate: '2026-11-14' })
    const r = rd.readiness(store.getState(), at(NOW))
    const exam = Date.parse('2026-11-14T09:00:00')
    expect(r.daysLeft).toBe(1)
    expect(r.todayGain).toBeCloseTo(pj.examRecall(c, T, exam) - pj.recallAt(c, exam), 9)
    expect(r.todayGain).toBeGreaterThan(0.1)
  })

  it('exam day and past exam: no gain claimed', async () => {
    const cards = overdue(20)
    for (const examDate of ['2026-11-13', '2026-07-05']) {
      const { store, rd } = await setup(cards, { examDate })
      expect(rd.readiness(store.getState(), at(NOW)).todayGain).toBe(0)
    }
  })

  it('exam far away, one review today: the honest gain is tiny (and never negative)', async () => {
    const c = card({ due: T - HOUR, last_review: T - 5 * DAY, stability: 4, scheduled_days: 4 })
    const { store, rd } = await setup({ [L('5-0')]: c }, { dailyNew: 0, examDate: '2027-07-04' })
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.todayGain).toBeGreaterThanOrEqual(0)
    expect(r.todayGain).toBeLessThan(0.05)
  })

  it('a backlog near the exam makes skipping cost more: a day lost pushes 225 reviews past the exam', async () => {
    // N3: a level with more than 1,200 words (N5 has 718)
    const calm = await setup(overdue(200, 7, 0, 3), { target: 3, dailyNew: 0, examDate: '2026-11-18' })
    const busy = await setup(overdue(1200, 7, 0, 3), { target: 3, dailyNew: 0, examDate: '2026-11-18' })
    const a = calm.rd.readiness(calm.store.getState(), at(NOW))
    const b = busy.rd.readiness(busy.store.getState(), at(NOW))
    expect(b.held).toBe(975)
    expect(b.todayGain).toBeGreaterThan(a.todayGain + 5)
  })

  it('far from the exam a day’s delay of an overdue review costs (almost) nothing in the model, and nothing is inflated', async () => {
    // FSRS gives a later successful review a larger stability gain, so one day later can even end higher on the
    // exam morning; the gain is then reported as 0, not as a made-up positive number
    const { store, rd } = await setup(overdue(1200, 7, 0, 3), { target: 3, dailyNew: 0 })
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.todayGain).toBeGreaterThanOrEqual(0)
    expect(r.todayGain).toBeLessThan(1)
  })

  it('huge backlog (5,000 overdue across levels): sane numbers within a render budget', async () => {
    const cards: Record<string, SCard> = {}
    let k = 0
    for (const [l, n] of [[5, 718], [4, 668], [3, 2140], [2, 1474]] as const)
      for (let i = 0; i < n; i++, k++) cards[L(`${l}-${i}`)] = card({ due: T - 14 * DAY + k * MIN, last_review: T - 20 * DAY, stability: 2 + (k % 30), difficulty: 3 + (k % 6), scheduled_days: 6 })
    const { store, rd, srs } = await setup(cards, { target: 2, includeLower: true })
    const t0 = performance.now()
    const r = rd.readiness(store.getState(), at(NOW))
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(r.held).toBe(5000 - 225)
    expect(r.catchUp).toBe(Math.ceil(5000 / 225))
    expect(r.todayGain).toBeGreaterThan(0)
    expect(r.plan).toBeGreaterThanOrEqual(r.stop)
    expect(r.plan).toBeLessThanOrEqual(r.total)
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ review: 225, held: 4775, fresh: 5 })
  })
})

describe('state and backups', () => {
  it('the day’s extra reviews (log.xr) survive a backup round trip; old files without it load unchanged', async () => {
    const { store, srs } = await setup(overdue(300))
    srs.unlockMoreReviews(50, at(NOW))
    const backup = await import('../../src/backup')
    const file = JSON.parse(JSON.stringify(backup.backupFile(store.getState())))
    const read = backup.readBackup(file)
    expect(read.ok && read.state.log['2026-11-13'].xr).toBe(50)
    expect(store.getState().v).toBe(4)
    // a state saved before this field existed (and before stable ids)
    const b = await boot({ now: NOW, legacy: { v: 3, onboarded: true, settings: { target: 5 }, cards: legacyKeys(overdue(300)), log: { '2026-11-13': log({ c: 3, r: 3 }) }, marks: [], xp: 0 } })
    expect(b.srs.buildQueue(b.store.getState(), at(NOW))).toMatchObject({ review: 222, held: 78 })
  })
})
