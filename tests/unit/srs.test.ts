import { describe, expect, it } from 'vitest'
import { at, bootUser, card, DAY, HOUR, MIN, KEY, L } from './helpers'
import type { DayLog, SCard } from '../../src/store'

// Friday 2026-11-13, 09:00 in Seoul
const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)
const LEARNING = 1
const REVIEW = 2
const RELEARNING = 3

const log = (p: Partial<DayLog>): DayLog => ({ c: 0, n: 0, r: 0, p: 0, ...p })

async function withCards(cards: Record<string, SCard>, settings = {}, now = NOW) {
  const b = await bootUser(now, settings)
  b.store.update((d) => void (d.cards = cards))
  return b
}

// ── queue ───────────────────────────────────────────────────────────────────

describe('buildQueue: new words', () => {
  it('a new user gets the first `dailyNew` words of the target level, in order', async () => {
    const { srs, store } = await bootUser(NOW, { target: 4, dailyNew: 10, includeLower: false })
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ fresh: 10, review: 0, learning: 0, waiting: 0, next: { id: L('4-0'), kind: 'new' } })
  })

  it('words already started are skipped', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + 5 * DAY }), [L('5-2')]: card({ due: T + 5 * DAY }) })
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe(L('5-1'))
  })

  it('the limit counts new words met today, plus any unlocked extra', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 10 })
    store.update((d) => void (d.log = { '2026-11-13': log({ c: 7, n: 7 }) }))
    expect(srs.newLeftToday(store.getState(), at(NOW))).toBe(3)
    srs.unlockMoreNew(10, at(NOW))
    expect(srs.newLeftToday(store.getState(), at(NOW))).toBe(13)
    expect(store.getState().log['2026-11-13'].x).toBe(10)
  })

  it('lowering dailyNew below what was already met today leaves no new words (never negative)', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 20 })
    store.update((d) => void (d.log = { '2026-11-13': log({ c: 12, n: 12 }) }))
    store.update((d) => void (d.settings.dailyNew = 5))
    expect(srs.newLeftToday(store.getState(), at(NOW))).toBe(0)
    expect(srs.buildQueue(store.getState(), at(NOW)).fresh).toBe(0)
  })

  it('yesterday’s new words do not count against today', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 10 })
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 10, n: 10 }) }))
    expect(srs.newLeftToday(store.getState(), at(NOW))).toBe(10)
  })

  it('an exhausted level offers no new words and an empty queue', async () => {
    const cards: Record<string, SCard> = {}
    for (let i = 0; i < 718; i++) cards[L(`5-${i}`)] = card({ due: T + 30 * DAY })
    const { srs, store } = await withCards(cards, { target: 5 })
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.fresh).toBe(0)
    expect(q.next).toBeNull()
    expect(srs.breakdowns(store.getState())[5].new).toBe(0)
  })
})

describe('buildQueue: what is due today', () => {
  it('counts reviews due any time before local midnight, but not after', async () => {
    const { srs, store } = await withCards({
      [L('5-0')]: card({ due: T - 3 * DAY }), // overdue
      [L('5-1')]: card({ due: at('2026-11-13T23:59:59').getTime() }),
      [L('5-2')]: card({ due: at('2026-11-14T00:00:00').getTime() }),
    }, { dailyNew: 0 })
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.review).toBe(2)
    expect(q.next).toEqual({ id: L('5-0'), kind: 'review' })
  })

  it('learning cards within the 20-minute learn-ahead window are shown early', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + 15 * MIN, state: LEARNING }) }, { dailyNew: 0 })
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ learning: 1, waiting: 0, next: { id: L('5-0'), kind: 'learning' } })
  })

  it('learning cards further out than the window wait, but still count for today', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + 25 * MIN, state: RELEARNING }) }, { dailyNew: 0 })
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ learning: 1, waiting: 1, next: null })
  })

  it('a learning card due tomorrow is not part of today', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: at('2026-11-14T00:05:00').getTime(), state: LEARNING }) }, { dailyNew: 0 })
    expect(srs.buildQueue(store.getState(), at('2026-11-13T23:50:00'))).toMatchObject({ learning: 0, waiting: 0, next: null })
  })

  it('across midnight: tomorrow’s reviews appear and the new-word allowance resets', async () => {
    const due = at('2026-11-14T00:30:00').getTime()
    const { srs, store } = await withCards({ [L('5-100')]: card({ due }) }, { dailyNew: 5 }, '2026-11-13T23:59:00')
    store.update((d) => void (d.log = { '2026-11-13': log({ c: 5, n: 5 }) }))
    const before = srs.buildQueue(store.getState(), at('2026-11-13T23:59:00'))
    expect(before).toMatchObject({ review: 0, fresh: 0, next: null })
    const after = srs.buildQueue(store.getState(), at('2026-11-14T00:01:00'))
    expect(after.review).toBe(1)
    expect(after.fresh).toBe(5)
  })
})

describe('buildQueue: order', () => {
  it('learning cards already due come first, then reviews, with a new word every 4th card', async () => {
    const { srs, store } = await withCards({
      [L('5-100')]: card({ due: T - HOUR }),
      [L('5-101')]: card({ due: T - 2 * HOUR }),
      [L('5-102')]: card({ due: T - MIN, state: LEARNING }),
    })
    const s = () => store.getState()
    expect(srs.buildQueue(s(), at(NOW)).next).toEqual({ id: L('5-102'), kind: 'learning' })
    store.update((d) => void (d.cards = { [L('5-100')]: d.cards[L('5-100')], [L('5-101')]: d.cards[L('5-101')] }))
    // oldest review first
    expect(srs.buildQueue(s(), at(NOW)).next).toEqual({ id: L('5-101'), kind: 'review' })
    for (const [c, kind] of [[0, 'review'], [1, 'review'], [2, 'review'], [3, 'new'], [7, 'new'], [8, 'review']] as const) {
      store.update((d) => void (d.log = { '2026-11-13': log({ c }) }))
      expect(srs.buildQueue(s(), at(NOW)).next?.kind, `after ${c} answers`).toBe(kind)
    }
  })

  it('with no reviews left, new words come before learning cards that are not due yet', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + 5 * MIN, state: LEARNING }) })
    expect(srs.buildQueue(store.getState(), at(NOW)).next).toEqual({ id: L('5-1'), kind: 'new' })
  })
})

describe('buildQueue: avoid repeating the last card', () => {
  it('skips the card just answered when something else is available', async () => {
    const { srs, store } = await withCards({
      [L('5-0')]: card({ due: T - MIN, state: LEARNING }),
      [L('5-1')]: card({ due: T - HOUR }),
    }, { dailyNew: 0 })
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe(L('5-0'))
    expect(srs.buildQueue(store.getState(), at(NOW), L('5-0')).next?.id).toBe(L('5-1'))
  })

  it('still shows it when it is the only card left', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + MIN, state: LEARNING }) }, { dailyNew: 0 })
    expect(srs.buildQueue(store.getState(), at(NOW), L('5-0')).next?.id).toBe(L('5-0'))
  })
})

// ── answering ───────────────────────────────────────────────────────────────

describe('answer', () => {
  it('a new word answered “알아요” enters learning and counts as new', async () => {
    const { srs, store } = await bootUser(NOW)
    const xp = srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    const s = store.getState()
    expect(xp).toBe(10)
    expect(s.cards[L('5-0')].state).toBe(LEARNING)
    expect(s.cards[L('5-0')].due).toBe(T + 10 * MIN)
    expect(s.log['2026-11-13']).toMatchObject({ c: 1, n: 1, r: 0, p: 0, xp: 10 })
    expect(s.xp).toBe(10)
  })

  it('“쉬워요” on a new word graduates it straight to review', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Easy, at(NOW))
    const c = store.getState().cards[L('5-0')]
    expect(c.state).toBe(REVIEW)
    expect(c.due - T).toBeGreaterThanOrEqual(DAY)
  })

  it('“모르겠어요” keeps it in learning and brings it back within minutes', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Again, at(NOW))
    const c = store.getState().cards[L('5-0')]
    expect(c.state).toBe(LEARNING)
    expect(c.due).toBe(T + MIN)
  })

  it('learning → 알아요 → review; only the first answer counts as a new word', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    srs.answer(L('5-0'), srs.Rating.Good, new Date(T + 10 * MIN))
    const s = store.getState()
    expect(s.cards[L('5-0')].state).toBe(REVIEW)
    expect(s.log['2026-11-13']).toMatchObject({ c: 2, n: 1, r: 0 })
  })

  it('review answers feed retention: forgotten → relearning, a lapse, r+1 p+0; remembered → r+1 p+1', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T, scheduled_days: 3, reps: 3 }), [L('5-1')]: card({ due: T }) })
    srs.answer(L('5-0'), srs.Rating.Again, at(NOW))
    srs.answer(L('5-1'), srs.Rating.Good, at(NOW))
    const s = store.getState()
    expect(s.cards[L('5-0')]).toMatchObject({ state: RELEARNING, lapses: 1 })
    expect(s.cards[L('5-1')].state).toBe(REVIEW)
    expect(s.log['2026-11-13']).toMatchObject({ c: 2, n: 0, r: 2, p: 1 })
  })

  it('logs under the local day of the answer, so a late-night answer counts for that night', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Good, at('2026-11-13T23:59:30'))
    srs.answer(L('5-1'), srs.Rating.Good, at('2026-11-14T00:00:30'))
    expect(Object.keys(store.getState().log).sort()).toEqual(['2026-11-13', '2026-11-14'])
  })

  it('does not crash when the device clock is behind the last review (clock set back)', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    const back = new Date(T - 30_000)
    expect(() => srs.previewIntervals(store.getState(), L('5-0'), back)).not.toThrow()
    expect(() => srs.answer(L('5-0'), srs.Rating.Good, back)).not.toThrow()
    expect(store.getState().log['2026-11-13'].c).toBe(2)
    // and a card reviewed "tomorrow" by a device whose clock was ahead
    store.update((d) => void (d.cards = { ...d.cards, [L('5-5')]: card({ due: T, last_review: T + DAY }) }))
    expect(() => srs.previewIntervals(store.getState(), L('5-5'), at(NOW))).not.toThrow()
    expect(() => srs.answer(L('5-5'), srs.Rating.Again, at(NOW))).not.toThrow()
  })

  it('previewIntervals describes the next interval of each answer', async () => {
    const { srs, store } = await bootUser(NOW)
    const p = srs.previewIntervals(store.getState(), L('5-0'), at(NOW))
    expect(p[srs.Rating.Again]).toBe('1분')
    expect(p[srs.Rating.Good]).toBe('10분')
    expect(p[srs.Rating.Easy]).toMatch(/일$/)
  })
})

describe('XP and quests', () => {
  it('pays 10 XP per card whatever the answer', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 20 })
    expect(srs.answer(L('5-0'), srs.Rating.Again, at(NOW))).toBe(10)
    expect(srs.answer(L('5-1'), srs.Rating.Easy, at(NOW))).toBe(10)
    expect(store.getState().xp).toBe(20)
  })

  it('awards the one quest — finishing today’s plan — exactly once, at the answer that completes it', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 5 })
    const gains: number[] = []
    // 5 new words, all “쉬워요”: the 5th clears the day
    for (let i = 0; i < 5; i++) gains.push(srs.answer(L(`5-${i}`), srs.Rating.Easy, new Date(T + i * MIN)))
    expect(gains).toEqual([10, 10, 10, 10, 10 + 50])
    expect(store.getState().log['2026-11-13'].q).toBe(0b1)
    // more words after clearing: the quest is not paid twice, and card counts earn no quest (03 §6)
    srs.unlockMoreNew(20, at(NOW))
    for (let i = 5; i < 25; i++) expect(srs.answer(L(`5-${i}`), srs.Rating.Easy, new Date(T + i * MIN))).toBe(10)
    const s = store.getState()
    expect(s.log['2026-11-13']).toMatchObject({ c: 25, n: 25, q: 0b1, xp: 25 * 10 + 50 })
    expect(s.xp).toBe(25 * 10 + 50)
  })

  it('quests reset the next day', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 5 })
    for (let i = 0; i < 5; i++) srs.answer(L(`5-${i}`), srs.Rating.Easy, at(NOW))
    const tomorrow = at('2026-11-14T09:00:00')
    expect(srs.quests(store.getState(), tomorrow).every((q) => !q.done)).toBe(true)
    expect(srs.answer(L('5-5'), srs.Rating.Easy, tomorrow)).toBe(10)
  })

  it('there is a single quest, finishing today’s plan (no card-count or new-word quests)', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 30 })
    expect(srs.quests(store.getState(), at(NOW))).toEqual([{ title: '오늘 분량 끝내기', have: 0, need: 1, xp: 50, done: false }])
  })
})

describe('undo (snapshot / restore)', () => {
  it('restores cards, the day log (incl. quest flags) and XP exactly', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 5 })
    for (let i = 0; i < 4; i++) srs.answer(L(`5-${i}`), srs.Rating.Easy, at(NOW))
    const before = structuredClone({ cards: store.getState().cards, log: store.getState().log, xp: store.getState().xp })
    const snap = srs.snapshot()
    const gained = srs.answer(L('5-4'), srs.Rating.Easy, at(NOW)) // completes the quest
    expect(gained).toBe(60)
    srs.restore(snap)
    const s = store.getState()
    expect({ cards: s.cards, log: s.log, xp: s.xp }).toEqual(before)
    // answering again pays the quest again, once
    expect(srs.answer(L('5-4'), srs.Rating.Easy, at(NOW))).toBe(60)
    expect(store.getState().xp).toBe(before.xp + 60)
  })

  it('undoing the first answer of a word makes it new again', async () => {
    const { srs, store } = await bootUser(NOW)
    const snap = srs.snapshot()
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    srs.restore(snap)
    expect(store.getState().cards[L('5-0')]).toBeUndefined()
    expect(srs.buildQueue(store.getState(), at(NOW)).next).toEqual({ id: L('5-0'), kind: 'new' })
  })

  it('does not undo unrelated changes such as bookmarks or settings', async () => {
    const { srs, store } = await bootUser(NOW)
    const snap = srs.snapshot()
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    store.toggleMark(L('5-0'))
    store.update((d) => void (d.settings.theme = 'dark'))
    srs.restore(snap)
    expect(store.getState().marks).toEqual([L('5-0')])
    expect(store.getState().settings.theme).toBe('dark')
  })

  it('restore is persisted', async () => {
    const { srs, store, ls } = await bootUser(NOW)
    const snap = srs.snapshot()
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW))
    srs.restore(snap)
    expect(JSON.parse(ls.getItem(KEY)!).cards).toEqual({})
    expect(store.getState().xp).toBe(0)
  })
})

// ── stats ───────────────────────────────────────────────────────────────────

describe('breakdowns / stageOf', () => {
  it('splits each level into new / learning / young / mature', async () => {
    const { srs, store } = await withCards({
      [L('5-0')]: card({ due: T, state: LEARNING }),
      [L('5-1')]: card({ due: T, state: RELEARNING }),
      [L('5-2')]: card({ due: T, scheduled_days: 20 }),
      [L('5-3')]: card({ due: T, scheduled_days: 21 }),
      [L('1-0')]: card({ due: T, scheduled_days: 100 }),
    })
    const b = srs.breakdowns(store.getState())
    expect(b[5]).toEqual({ new: 714, learning: 2, young: 1, mature: 1 })
    expect(b[1]).toEqual({ new: 2698, learning: 0, young: 0, mature: 1 })
    expect(b[3]).toEqual({ new: 2140, learning: 0, young: 0, mature: 0 })
    expect(srs.stageOf(undefined)).toBe('new')
  })
})

describe('forecast', () => {
  it('puts overdue and later-today cards at index 0 and drops cards beyond the window', async () => {
    const { srs, store } = await withCards({
      a: card({ due: T - 5 * DAY }),
      b: card({ due: at('2026-11-13T23:00:00').getTime() }),
      c: card({ due: at('2026-11-14T00:00:00').getTime() }),
      d: card({ due: at('2026-11-19T23:59:00').getTime() }),
      e: card({ due: at('2026-11-20T00:00:00').getTime() }),
    })
    expect(srs.forecast(store.getState(), at('2026-11-13T22:00:00'))).toEqual([2, 1, 0, 0, 0, 0, 1])
  })

  it('indexes by calendar day across a DST change', async () => {
    process.env.TZ = 'America/New_York'
    const now = new Date(2026, 10, 1, 0, 30) // fall-back night: 25-hour day
    const { srs, store } = await withCards({ a: card({ due: new Date(2026, 10, 2, 0, 10).getTime() }) }, {}, now.toISOString())
    expect(srs.forecast(store.getState(), now)[1]).toBe(1)
  })
})

describe('retention', () => {
  it('is null until there are 10 review answers in the window', async () => {
    const { srs, store } = await bootUser(NOW)
    store.update((d) => void (d.log = { '2026-11-13': log({ r: 9, p: 9 }) }))
    expect(srs.retention(store.getState(), at(NOW))).toBeNull()
  })

  it('sums the last 30 days including today and ignores older days', async () => {
    const { srs, store } = await bootUser(NOW)
    store.update(
      (d) =>
        void (d.log = {
          '2026-11-13': log({ r: 4, p: 3 }),
          '2026-10-15': log({ r: 6, p: 3 }), // 29 days ago: inside
          '2026-10-14': log({ r: 100, p: 0 }), // 30 days ago: outside
        }),
    )
    expect(srs.retention(store.getState(), at(NOW))).toBeCloseTo(0.6)
  })
})

describe('streak', () => {
  const days = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, log({ c: 1 })]))
  const today = at('2026-11-13T20:00:00')

  it('is 0 with no history', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak({}, today)).toBe(0)
  })

  it('today not studied yet does not break it', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak(days('2026-11-12', '2026-11-11'), today)).toBe(2)
  })

  it('counts today once studied', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak(days('2026-11-13', '2026-11-12', '2026-11-11'), today)).toBe(3)
    expect(srs.streak(days('2026-11-13'), today)).toBe(1)
  })

  it('a missed day resets it', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak(days('2026-11-13', '2026-11-11', '2026-11-10'), today)).toBe(1)
    expect(srs.streak(days('2026-11-11'), today)).toBe(0)
  })

  it('a day with a log but zero answers (e.g. only unlocked words) does not count', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak({ '2026-11-12': log({ x: 10 }) }, today)).toBe(0)
  })

  it('runs across month and year boundaries', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.streak(days('2027-01-01', '2026-12-31', '2026-12-30'), at('2027-01-01T08:00:00'))).toBe(3)
  })

  it('runs across a DST change', async () => {
    process.env.TZ = 'America/New_York'
    const { srs } = await bootUser(NOW)
    expect(srs.streak(days('2026-11-02', '2026-11-01', '2026-10-31'), new Date(2026, 10, 2, 0, 30))).toBe(3)
    expect(srs.streak(days('2026-03-09', '2026-03-08', '2026-03-07'), new Date(2026, 2, 9, 23, 30))).toBe(3)
  })
})

describe('weekDays', () => {
  it('Sunday-first week with today and future marked', async () => {
    const { srs } = await bootUser(NOW)
    // 2026-11-13 is a Friday
    const w = srs.weekDays({ '2026-11-08': log({ c: 1 }), '2026-11-13': log({ c: 2 }), '2026-11-07': log({ c: 1 }) }, at(NOW))
    expect(w.map((d) => d.done)).toEqual([true, false, false, false, false, true, false])
    expect(w.map((d) => d.today)).toEqual([false, false, false, false, false, true, false])
    expect(w.map((d) => d.future)).toEqual([false, false, false, false, false, false, true])
  })

  it('on a Sunday only that day is past-or-today', async () => {
    const { srs } = await bootUser(NOW)
    const w = srs.weekDays({}, at('2026-11-15T10:00:00'))
    expect(w[0].today).toBe(true)
    expect(w.filter((d) => d.future)).toHaveLength(6)
  })
})

describe('formatInterval / leechIds', () => {
  it('formats durations', async () => {
    const { srs } = await bootUser(NOW)
    expect(srs.formatInterval(30_000)).toBe('1분 이내')
    expect(srs.formatInterval(MIN)).toBe('1분')
    expect(srs.formatInterval(59 * MIN)).toBe('59분')
    expect(srs.formatInterval(HOUR)).toBe('1시간')
    expect(srs.formatInterval(DAY)).toBe('1일')
    expect(srs.formatInterval(45 * DAY)).toBe('2개월')
    expect(srs.formatInterval(400 * DAY)).toBe('1.1년')
  })

  it('leeches are cards forgotten twice or more, most-forgotten first', async () => {
    const { srs } = await bootUser(NOW)
    const ids = srs.leechIds({ a: card({ due: 0, lapses: 1 }), b: card({ due: 0, lapses: 2 }), c: card({ due: 0, lapses: 5 }) })
    expect(ids).toEqual(['c', 'b'])
  })
})

describe('scale', () => {
  it('answering stays fast with every word started', async () => {
    const cards: Record<string, SCard> = {}
    const counts = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2699 } as const
    for (const [l, n] of Object.entries(counts)) for (let i = 0; i < n; i++) cards[L(`${l}-${i}`)] = card({ due: T - (i % 50) * HOUR })
    const { srs, store } = await withCards(cards)
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) srs.answer(L(`3-${i}`), srs.Rating.Good, at(NOW))
    const per = (performance.now() - t0) / 20
    expect(per).toBeLessThan(50)
    expect(store.getState().log['2026-11-13'].c).toBe(20)
  })
})

// ── fixes from the curriculum spec (03 §1) ──────────────────────────────────

describe('P4: a learner targeting N3 also gets the N4/N5 words when lower levels are included', () => {
  it('new words come from the easiest level not yet finished, then up to the target', async () => {
    const { srs, store } = await bootUser(NOW, { target: 3, dailyNew: 10, includeLower: true })
    expect(srs.studyLevels(store.getState().settings)).toEqual([5, 4, 3])
    expect(srs.buildQueue(store.getState(), at(NOW)).next).toEqual({ id: L('5-0'), kind: 'new' })
    const n5: Record<string, SCard> = {}
    for (let i = 0; i < 718; i++) n5[L(`5-${i}`)] = card({ due: T + 30 * DAY })
    store.update((d) => void (d.cards = n5))
    expect(srs.buildQueue(store.getState(), at(NOW)).next).toEqual({ id: L('4-0'), kind: 'new' })
    expect(srs.newWordsLeft(store.getState())).toBe(668 + 2140)
  })

  it('with the setting off (learners from before it existed) only the target level is offered', async () => {
    const { srs, store } = await bootUser(NOW, { target: 3, dailyNew: 10, includeLower: false })
    expect(srs.buildQueue(store.getState(), at(NOW)).next).toEqual({ id: L('3-0'), kind: 'new' })
    expect(srs.newWordsLeft(store.getState())).toBe(2140)
  })
})

describe('P9: new words a day are capped at 40', () => {
  it('a daily setting above the cap still gives at most 40 new words, plus extras the learner unlocks', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 10 })
    expect(srs.newLeftToday(store.getState(), at(NOW), 100)).toBe(40)
    store.update((d) => void (d.settings.dailyNew = 100))
    expect(srs.buildQueue(store.getState(), at(NOW)).fresh).toBe(40)
    srs.unlockMoreNew(10, at(NOW))
    expect(srs.newLeftToday(store.getState(), at(NOW))).toBe(50)
  })
})

describe('P13: study time is recorded', () => {
  it('adds the active time of each answer to the day, at most 60 s per card', async () => {
    const { srs, store } = await bootUser(NOW)
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW), 7_400)
    srs.answer(L('5-1'), srs.Rating.Good, at(NOW), 5 * MIN) // left on screen: counts 60 s
    srs.answer(L('5-2'), srs.Rating.Good, at(NOW)) // no timing (e.g. an older caller): nothing added
    expect(store.getState().log['2026-11-13']).toMatchObject({ c: 3, ms: 7_400 + 60_000 })
  })

  it('records the predicted recall of review answers next to how many were remembered', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T, last_review: T - 3 * DAY, stability: 3 }), [L('5-1')]: card({ due: T, last_review: T - 10 * DAY, stability: 3 }) })
    srs.answer(L('5-0'), srs.Rating.Good, at(NOW), 3000)
    srs.answer(L('5-1'), srs.Rating.Again, at(NOW), 3000)
    const l = store.getState().log['2026-11-13']
    expect(l).toMatchObject({ r: 2, p: 1 })
    expect(l.e).toBeGreaterThan(0.9) // ≈ 0.90 + 0.7
    expect(l.e).toBeLessThan(2)
  })

  it('secondsPerAnswer uses the last 14 days once 50 timed answers exist, else 8 s', async () => {
    const { srs, store } = await bootUser(NOW)
    store.update((d) => void (d.log = { '2026-11-12': log({ c: 40, ms: 400_000 }) }))
    expect(srs.secondsPerAnswer(store.getState(), at(NOW))).toBe(8)
    store.update((d) => void (d.log = { ...d.log, '2026-11-10': log({ c: 20, ms: 200_000 }), '2026-10-01': log({ c: 900, ms: 1 }) }))
    expect(srs.secondsPerAnswer(store.getState(), at(NOW))).toBe(10)
    expect(srs.minutesFor({ review: 30, learning: 0, fresh: 10 }, 10)).toBe(10)
  })
})

describe('P7: a session never gets stuck on learning cards that come back in minutes', () => {
  it('only 10-minute learning cards left: they are shown at once (learn-ahead), the queue is not empty', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 3 })
    for (let i = 0; i < 3; i++) srs.answer(L(`5-${i}`), srs.Rating.Good, at(NOW)) // each comes back in 10 min
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q).toMatchObject({ fresh: 0, review: 0, learning: 3, waiting: 0 })
    expect(q.next?.kind).toBe('learning')
  })

  it('cards beyond the window wait, and “지금 마무리” (finishNow) shows them right away', async () => {
    const { srs, store } = await withCards({ [L('5-0')]: card({ due: T + 40 * MIN, state: RELEARNING }) }, { dailyNew: 0 })
    expect(srs.buildQueue(store.getState(), at(NOW))).toMatchObject({ next: null, waiting: 1, nextDue: T + 40 * MIN })
    expect(srs.buildQueue(store.getState(), at(NOW), undefined, { finishNow: true })).toMatchObject({ next: { id: L('5-0'), kind: 'learning' }, waiting: 0, nextDue: null })
  })
})
