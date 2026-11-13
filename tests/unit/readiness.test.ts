import { describe, expect, it } from 'vitest'
import { at, bootUser, card, DAY, HOUR, MIN } from './helpers'
import type { DayLog, SCard, State } from '../../src/store'

// Friday 2026-11-13 09:00 in Seoul; the default exam is Sunday 2026-12-06 (D-23)
const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)
const EXAM = Date.parse('2026-12-06T09:00:00')
const LEARNING = 1
const RELEARNING = 3

const log = (p: Partial<DayLog>): DayLog => ({ c: 0, n: 0, r: 0, p: 0, ...p })

async function setup(settings: Partial<State['settings']> = {}, extra: Partial<State> = {}, now = NOW) {
  const b = await bootUser(now, { target: 5, includeLower: false, dailyNew: 10, examDate: '2026-12-06', ...settings }, extra)
  const rd = await import('../../src/readiness')
  const pnew = await import('../../src/pnew')
  return { ...b, rd, pnew }
}

/** A review card last seen `ago` days before NOW with stability `s`, due `dueIn` days from NOW. */
const rev = (s: number, ago: number, dueIn: number, extra: Partial<SCard> = {}) =>
  card({ due: T + dueIn * DAY, last_review: T - ago * DAY, stability: s, scheduled_days: ago + dueIn, ...extra })

describe('forgetting curve (ts-fsrs)', () => {
  it('matches the value the spec checked against the installed ts-fsrs: S = 2.3065, t = 31 days → 0.664', async () => {
    const { rd } = await setup()
    const c = card({ due: T, last_review: T, stability: 2.3065 })
    expect(rd.recallAt(c, T + 31 * DAY)).toBeCloseTo(0.664, 3)
    expect(rd.recallAt(c, T)).toBe(1)
  })

  it('the exam is measured at 09:00 local time on the exam day', async () => {
    const { rd } = await setup()
    expect(rd.examTime('2026-12-06')).toBe(EXAM)
  })
})

describe('readiness: edge states', () => {
  it('empty state: nothing recalled, the plan is the new words still to come, status not judged yet', async () => {
    const { rd, store, pnew } = await setup()
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r).toMatchObject({ past: false, examDay: false, daysLeft: 23, levels: [5], total: 718, goalWords: Math.ceil(0.8 * 718), stop: 0, unseen: 718, status: 'early' })
    // 10 today and 10 on each of the following 22 days before the exam
    expect(r.plannedNew).toBe(230)
    let expected = 0
    for (let k = 0; k < 23; k++) expected += 10 * pnew.pNew(23 - k)
    expect(r.plan).toBeCloseTo(expected, 6)
    // today's gain is today's 10 words
    expect(r.todayGain).toBeCloseTo(10 * pnew.pNew(23), 6)
  })

  it('all words new and the exam far away: introductions stop when the list runs out', async () => {
    const { rd, store } = await setup({ examDate: '2027-07-04', dailyNew: 40 })
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.plannedNew).toBe(718)
    expect(r.plan).toBeLessThanOrEqual(718)
    expect(r.plan).toBeGreaterThan(0.85 * 718)
  })

  it('mixed states: words in other levels do not count; learning and review cards do', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    store.update(
      (d) =>
        void (d.cards = {
          '5-0': rev(30, 5, 20), // strong review card
          '5-1': rev(1, 3, -2), // weak, overdue
          '5-2': card({ due: T + 10 * MIN, last_review: T, stability: 0.5, state: LEARNING, scheduled_days: 0 }),
          '5-3': card({ due: T + 10 * MIN, last_review: T, stability: 0.3, state: RELEARNING, lapses: 1, scheduled_days: 0 }),
          '4-0': rev(100, 1, 50), // another level: not in the target set
        }),
    )
    const r = rd.readiness(store.getState(), at(NOW))
    const s = store.getState().cards
    const stop = ['5-0', '5-1', '5-2', '5-3'].reduce((n, id) => n + rd.recallAt(s[id], EXAM), 0)
    expect(r.stop).toBeCloseTo(stop, 6)
    expect(r.stop).toBeLessThan(4)
    expect(r.stop).toBeGreaterThan(0)
    // each card is between 0 and 1
    for (const id of Object.keys(s)) expect(rd.recallAt(s[id], EXAM)).toBeGreaterThanOrEqual(0)
    // learning cards reviewed once more (they are due in minutes) do better than if left alone
    expect(rd.recallAfterReview(s['5-2'], T + 10 * MIN, EXAM)).toBeGreaterThan(rd.recallAt(s['5-2'], EXAM))
    expect(r.plan).toBeGreaterThan(r.stop)
    expect(r.unseen).toBe(714)
  })

  it('a card due after the exam counts with its exam-day recall in both figures', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    store.update((d) => void (d.cards = { '5-0': rev(60, 2, 40) }))
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.plan).toBeCloseTo(r.stop, 9)
    expect(r.todayGain).toBe(0)
  })

  it('the plan figure follows the lookahead formula r·R(Good) + (1−r)·R(Again) for a card due before the exam', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    const c = rev(4, 4, 3)
    store.update((d) => void (d.cards = { '5-0': c }))
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.plan).toBeCloseTo(rd.recallAfterReview(c, c.due, EXAM), 9)
    expect(r.plan).toBeGreaterThan(r.stop)
  })

  it('exam date in the past: no figure is claimed', async () => {
    const { rd, store } = await setup({ examDate: '2026-07-05' })
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.past).toBe(true)
    expect(r.plannedNew).toBe(0)
    expect(rd.paceToGoal(store.getState(), at(NOW))).toBeNull()
  })

  it('exam today: nothing left to plan, the plan equals the stop-now figure', async () => {
    const { rd, store } = await setup({ examDate: '2026-11-13', dailyNew: 20 }, {}, '2026-11-13T07:00:00')
    store.update((d) => void (d.cards = { '5-0': rev(3, 2, -1), '5-1': rev(20, 2, 5) }))
    const r = rd.readiness(store.getState(), at('2026-11-13T07:00:00'))
    expect(r).toMatchObject({ past: false, examDay: true, daysLeft: 0, plannedNew: 0, todayGain: 0 })
    expect(r.plan).toBeCloseTo(r.stop, 9)
  })

  it('a word with several cards counts its weakest card', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    store.update((d) => void (d.cards = { '5-0': rev(50, 1, 40), '5-0:r': rev(1, 5, 40) }))
    const r = rd.readiness(store.getState(), at(NOW))
    const s = store.getState().cards
    expect(r.stop).toBeCloseTo(Math.min(rd.recallAt(s['5-0'], EXAM), rd.recallAt(s['5-0:r'], EXAM)), 9)
    expect(r.unseen).toBe(717)
  })

  it('the same input gives the same output', async () => {
    const { rd, store } = await setup()
    store.update((d) => void (d.cards = { '5-0': rev(4, 4, -1), '5-1': rev(9, 2, 3) }))
    const a = rd.readiness(store.getState(), at(NOW))
    const b = rd.readiness(structuredClone(store.getState()), at(NOW))
    expect(b).toEqual(a)
  })
})

describe('readiness: target set and status', () => {
  it('with lower levels included the set is the target and every level below it', async () => {
    const { rd, store } = await setup({ target: 3, includeLower: true })
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.levels).toEqual([5, 4, 3])
    expect(r.total).toBe(718 + 668 + 2140)
  })

  it('status: early under 30 review answers, then on track / tight / at risk against the goal', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    const strong: Record<string, SCard> = {}
    for (let i = 0; i < 718; i++) strong[`5-${i}`] = rev(200, 1, 150)
    store.update((d) => void (d.cards = strong))
    expect(rd.readiness(store.getState(), at(NOW)).status).toBe('early')
    store.update((d) => void (d.log = { '2026-11-10': log({ c: 30, r: 30, p: 29 }) }))
    expect(rd.readiness(store.getState(), at(NOW)).status).toBe('ontrack')
    // remove words until the plan sits between 90% and 100% of the goal, then below 90%
    const goal = Math.ceil(0.8 * 718)
    const keep = (n: number) => Object.fromEntries(Object.entries(strong).slice(0, n))
    store.update((d) => void (d.cards = keep(Math.ceil(goal * 0.95))))
    expect(rd.readiness(store.getState(), at(NOW)).status).toBe('tight')
    store.update((d) => void (d.cards = keep(Math.floor(goal * 0.85))))
    expect(rd.readiness(store.getState(), at(NOW)).status).toBe('risk')
  })

  it('the goal setting changes the goal in words', async () => {
    const { rd, store } = await setup({ goal: 0.9 })
    expect(rd.readiness(store.getState(), at(NOW)).goalWords).toBe(Math.ceil(0.9 * 718))
  })

  it('calibration: when the last 30 days were remembered clearly less than predicted, every figure is scaled', async () => {
    const { rd, store } = await setup({ dailyNew: 0 })
    store.update((d) => void (d.cards = { '5-0': rev(30, 2, 30), '5-1': rev(30, 2, 30) }))
    const before = rd.readiness(store.getState(), at(NOW))
    expect(before.calibrated).toBe(false)
    // predicted 0.9 on average, remembered 0.7
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 40, r: 40, p: 28, e: 36 }) }))
    const after = rd.readiness(store.getState(), at(NOW))
    expect(after.calibrated).toBe(true)
    expect(after.factor).toBeCloseTo(28 / 36, 9)
    expect(after.stop).toBeCloseTo(before.stop * (28 / 36), 9)
    // within 5 points of the prediction: left alone
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 40, r: 40, p: 35, e: 36 }) }))
    expect(rd.readiness(store.getState(), at(NOW)).calibrated).toBe(false)
  })
})

describe('readiness: monotonicity', () => {
  const mixed = () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 300; i++) cards[`5-${i}`] = rev(1 + (i % 40), 1 + (i % 9), (i % 30) - 10, { difficulty: 3 + (i % 6) })
    return cards
  }

  it('a later exam date never raises the stop-now figure', async () => {
    const { rd, store, util } = await setup({ dailyNew: 0 })
    store.update((d) => void (d.cards = mixed()))
    let prev = Infinity
    for (const exam of ['2026-11-20', '2026-12-06', '2027-01-10', '2027-07-04', '2028-07-02']) {
      store.update((d) => void (d.settings.examDate = exam))
      const r = rd.readiness(store.getState(), at(NOW))
      expect(r.stop, exam).toBeLessThanOrEqual(prev + 1e-9)
      prev = r.stop
    }
    expect(util.dayKey(at(NOW))).toBe('2026-11-13')
  })

  it('more study never lowers the figures: answering a due card “알아요”, meeting a new word, a faster pace', async () => {
    const { rd, store, srs } = await setup({ dailyNew: 10 })
    store.update((d) => void (d.cards = mixed()))
    const s0 = rd.readiness(store.getState(), at(NOW))
    // review every card that is due now with “알아요”
    const due = Object.entries(store.getState().cards).filter(([, c]) => c.due <= T)
    expect(due.length).toBeGreaterThan(20)
    for (const [id] of due) srs.answer(id, srs.Rating.Good, at(NOW))
    const s1 = rd.readiness(store.getState(), at(NOW))
    expect(s1.stop).toBeGreaterThanOrEqual(s0.stop)
    // a new word answered, even forgotten, only adds
    srs.answer('5-500', srs.Rating.Again, at(NOW))
    const s2 = rd.readiness(store.getState(), at(NOW))
    expect(s2.stop).toBeGreaterThan(s1.stop)
    // a faster daily pace never lowers the plan
    let prev = -1
    for (const n of rd.PACES) {
      const r = rd.readiness(store.getState(), at(NOW), { dailyNew: n })
      expect(r.plan).toBeGreaterThanOrEqual(prev)
      prev = r.plan
    }
  })

  it('the plan figure is never below the stop-now figure for ordinary cards; today’s gain is never negative', async () => {
    const { rd, store } = await setup({ dailyNew: 10 })
    store.update((d) => void (d.cards = mixed()))
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.plan).toBeGreaterThanOrEqual(r.stop)
    expect(r.todayGain).toBeGreaterThan(0)
    store.update((d) => void (d.settings.dailyNew = 0))
    expect(rd.readiness(store.getState(), at(NOW)).todayGain).toBeGreaterThanOrEqual(0)
  })
})

describe('the pace lever (03 §4.3) never goes past the cap', () => {
  it('offers the smallest pace that reaches the goal, or says none does', async () => {
    const { rd, store } = await setup({ dailyNew: 5 })
    const p = rd.paceToGoal(store.getState(), at(NOW))
    expect(typeof p).toBe('number')
    expect(p as number).toBeGreaterThan(5)
    // the pace just below it does not reach the goal
    const below = rd.PACES[rd.PACES.indexOf(p as number) - 1]
    if (below > 5) expect(rd.readiness(store.getState(), at(NOW), { dailyNew: below }).plan).toBeLessThan(rd.readiness(store.getState(), at(NOW)).goalWords)
    expect(p as number).toBeLessThanOrEqual(40)
    expect(rd.readiness(store.getState(), at(NOW), { dailyNew: p as number }).plan).toBeGreaterThanOrEqual(rd.readiness(store.getState(), at(NOW)).goalWords)
    // N1 in 23 days cannot be reached at any allowed pace
    store.update((d) => void Object.assign(d.settings, { target: 1, examDate: '2026-12-06', dailyNew: 20 }))
    expect(rd.paceToGoal(store.getState(), at(NOW))).toBe('none')
  })
})

describe('performance', () => {
  it('~8,000 cards: first computation is fast enough for a render, a repeat is memoised, one answer re-uses the rest', async () => {
    const { rd, store, srs } = await setup({ target: 1, includeLower: true, dailyNew: 20 })
    const counts = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2600 } as const
    const cards: Record<string, SCard> = {}
    for (const [l, n] of Object.entries(counts)) for (let i = 0; i < n; i++) cards[`${l}-${i}`] = rev(1 + (i % 60), 1 + (i % 20), (i % 50) - 15)
    store.update((d) => void (d.cards = cards))
    expect(Object.keys(cards).length).toBeGreaterThan(8000)

    let t0 = performance.now()
    const a = rd.readiness(store.getState(), at(NOW))
    const cold = performance.now() - t0
    expect(cold).toBeLessThan(1500)

    t0 = performance.now()
    expect(rd.readiness(store.getState(), new Date(T + 5 * MIN))).toBe(a)
    expect(performance.now() - t0).toBeLessThan(5)

    srs.answer('3-7', srs.Rating.Good, at(NOW))
    t0 = performance.now()
    rd.readiness(store.getState(), new Date(T + 5 * MIN))
    const warm = performance.now() - t0
    expect(warm).toBeLessThan(Math.max(60, cold / 3))

    // a new hour recomputes overdue cards only (their review time moves); still well within a render
    t0 = performance.now()
    rd.readiness(store.getState(), new Date(T + 2 * HOUR))
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})
