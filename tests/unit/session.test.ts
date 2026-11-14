// The study session's history (src/session.ts): swiping back never changes anything; changing the grade of an earlier
// answer gives the state the learner would have had with that grade from the start.
import { describe, expect, it } from 'vitest'
import { boot, card, DAY, L, MIN } from './helpers'
import type { SCard, State } from '../../src/store'
import type { Grade } from '../../src/srs'

const NOW = '2026-11-14T09:00:00'
const T = Date.parse(NOW)
const AGAIN = 1 as Grade
const GOOD = 3 as Grade
const EASY = 4 as Grade
const GRADES = [AGAIN, GOOD, EASY]

async function env(cards: Record<string, SCard> = {}, settings: Partial<State['settings']> = {}) {
  const b = await boot({ now: NOW })
  const { Session } = await import('../../src/session')
  const start: State = {
    ...b.store.getState(),
    onboarded: true,
    settings: { ...b.store.getState().settings, target: 5, includeLower: false, dailyNew: 0, fastTrack: true, ...settings },
    cards,
    log: {},
    xp: 0,
  }
  const reset = () => b.store.replaceState(structuredClone(start))
  reset()
  /** what was learned: cards, the day logs and XP (`rev`, the save counter, counts saves, not learning) */
  const learned = () => {
    const s = b.store.getState()
    return structuredClone({ cards: s.cards, log: s.log, xp: s.xp })
  }
  return { ...b, Session, reset, learned }
}

/** A small seeded random number generator, so a failing session can be replayed. */
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 2 ** 32
  }
}

const review = (dueOffsetMs: number, extra: Partial<SCard> = {}) => card({ due: T + dueOffsetMs, ...extra })

type Ev = { id: string; grade: Grade; at: number; ms: number }

describe('re-grading an answer of the session', () => {
  it('property: answer A then change it to B = answer B (random sessions, the later answers of the card replayed or dropped)', async () => {
    // reviews due today, a relearning card, and new words (no card yet)
    const pool = Array.from({ length: 8 }, (_, i) => L(`5-${i}`))
    const cards: Record<string, SCard> = {}
    pool.slice(0, 4).forEach((id, i) => (cards[id] = review(-DAY + i * MIN, { lapses: i % 3 })))
    cards[pool[4]] = review(-MIN, { state: 3, scheduled_days: 0, stability: 1, last_review: T - 10 * MIN, lapses: 1 })
    const e = await env(cards)
    const { srs } = e
    let checked = 0
    let dropped = 0
    for (let run = 0; run < 120; run++) {
      const r = rng(run + 1)
      // a session of 4–14 answers, 20 s – 12 min apart; the same card often comes back (learning steps)
      const evs: Ev[] = []
      let at = T
      const n = 4 + Math.floor(r() * 11)
      for (let i = 0; i < n; i++) {
        at += 20_000 + Math.floor(r() * 12 * MIN)
        const id = i > 0 && r() < 0.35 ? evs[Math.floor(r() * evs.length)].id : pool[Math.floor(r() * pool.length)]
        evs.push({ id, grade: GRADES[Math.floor(r() * 3)], at, ms: 1000 + Math.floor(r() * 9000) })
      }
      const k = Math.floor(r() * n)
      const B = GRADES.filter((g) => g !== evs[k].grade)[Math.floor(r() * 2)]

      // A, then changed to B
      e.reset()
      const session = new e.Session()
      for (const v of evs) session.answer({ ...v, kind: 'review' })
      const res = session.regrade(k, B)
      expect(res).not.toBeNull()
      const edited = e.learned()

      // B from the start: the later answers of that card only while it would still have come back that day
      e.reset()
      let gone = false
      const kept: Ev[] = []
      evs.forEach((v, i) => {
        const g = i === k ? B : v.grade
        if (i > k && v.id === evs[k].id) {
          const c = e.store.getState().cards[v.id]
          if (gone || !(c && c.due < srs.endOfDay(new Date(v.at)))) {
            gone = true
            return
          }
        }
        kept.push({ ...v, grade: g })
        srs.answer(v.id, g, new Date(v.at), v.ms)
      })
      expect(edited, `run ${run}: answer ${k} ${evs[k].grade}→${B}`).toEqual(e.learned())
      expect(session.length).toBe(kept.length)
      expect(session.entries.map((x) => [x.id, x.grade, x.at])).toEqual(kept.map((x) => [x.id, x.grade, x.at]))
      dropped += res!.dropped.length
      checked++
    }
    expect(checked).toBe(120)
    // the rule for later answers that could no longer have happened was exercised
    expect(dropped).toBeGreaterThan(0)
  })

  it('changing a grade and changing it back gives the original state when nothing was dropped', async () => {
    const e = await env({ [L('5-1')]: review(-DAY), [L('5-2')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T, ms: 4000 })
    s.answer({ id: L('5-2'), kind: 'review', grade: EASY, at: T + MIN, ms: 3000 })
    const original = e.learned()
    s.regrade(0, AGAIN)
    expect(e.learned()).not.toEqual(original)
    s.regrade(0, GOOD)
    expect(e.learned()).toEqual(original)
  })

  it('the same grade, a missing answer, or a state changed elsewhere changes nothing', async () => {
    const e = await env({ [L('5-1')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    const rev = e.store.getState().rev
    expect(s.regrade(0, GOOD)).toBeNull()
    expect(s.regrade(3, AGAIN)).toBeNull()
    expect(e.store.getState().rev).toBe(rev) // not even saved again
    // another tab answered the same card since: the history no longer describes the state
    e.srs.answer(L('5-1'), EASY, new Date(T + MIN))
    const after = e.learned()
    expect(s.consistent()).toBe(false)
    expect(s.regrade(0, AGAIN)).toBeNull()
    expect(s.undoLast()).toBeNull()
    expect(e.learned()).toEqual(after)
  })

  it('a settings change from another tab (the state reloaded as new objects) keeps the history usable', async () => {
    const e = await env({ [L('5-1')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    e.store.replaceState(JSON.parse(JSON.stringify(e.store.getState())))
    expect(s.consistent()).toBe(true)
    expect(s.regrade(0, AGAIN)).not.toBeNull()
  })
})

describe('what a re-grade changes', () => {
  it('to 모르겠어요: lapse, retention counts and weak words follow; the card comes back today; XP and time stay', async () => {
    const id = L('5-1')
    const e = await env({ [id]: review(-DAY, { lapses: 1 }), [L('5-2')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id, kind: 'review', grade: GOOD, at: T, ms: 5000 })
    let st = e.store.getState()
    expect(st.log['2026-11-14']).toMatchObject({ c: 1, n: 0, r: 1, p: 1, ms: 5000, xp: 10 })
    expect(e.srs.leechIds(st.cards)).toEqual([])
    expect(e.srs.buildQueue(st, new Date(T + MIN)).next?.id).toBe(L('5-2'))

    s.regrade(0, AGAIN)
    st = e.store.getState()
    // one answer still, now forgotten: retention counts it as not remembered
    expect(st.log['2026-11-14']).toMatchObject({ c: 1, n: 0, r: 1, p: 0, ms: 5000, xp: 10 })
    expect(st.xp).toBe(10)
    expect(st.cards[id].lapses).toBe(2)
    expect(st.cards[id].state).toBe(3)
    expect(e.srs.leechIds(st.cards)).toEqual([id]) // forgotten twice: a weak word now
    // back today as a relearning card, per the normal steps
    const q = e.srs.buildQueue(st, new Date(T + 11 * MIN))
    expect(q.learning).toBe(1)
    expect(st.cards[id].due).toBeLessThan(e.srs.endOfDay(new Date(T)))

    s.regrade(0, GOOD)
    st = e.store.getState()
    // away from 모르겠어요: its relearning step leaves today's queue
    expect(e.srs.buildQueue(st, new Date(T + 11 * MIN)).learning).toBe(0)
    expect(st.cards[id].lapses).toBe(1)
    expect(e.srs.leechIds(st.cards)).toEqual([])
  })

  it('a new word: n stays one introduction; "모르겠어요" → "쉬워요" graduates it and drops its later steps', async () => {
    const id = L('5-7')
    const e = await env()
    const s = new e.Session()
    s.answer({ id, kind: 'new', grade: AGAIN, at: T, ms: 3000 })
    s.answer({ id, kind: 'learning', grade: GOOD, at: T + 2 * MIN, ms: 2000 })
    s.answer({ id, kind: 'learning', grade: GOOD, at: T + 13 * MIN, ms: 2000 })
    // the third answer finished the day (no other cards): 3 × 10 + the quest's 50
    expect(e.store.getState().log['2026-11-14']).toMatchObject({ c: 3, n: 1, xp: 80, ms: 7000 })
    const res = s.regrade(0, EASY)!
    expect(res.dropped).toHaveLength(2)
    expect(s.length).toBe(1)
    const st = e.store.getState()
    // as if 쉬워요 had been the only answer: one card answered, one word introduced, its time only; that answer
    // now finishes the day, so the quest moves to it
    expect(st.log['2026-11-14']).toMatchObject({ c: 1, n: 1, xp: 60, ms: 3000, q: 1 })
    expect(st.xp).toBe(60)
    expect(st.cards[id].state).toBe(2)
    expect(st.cards[id].reps).toBe(1)
  })

  it('later answers of the card are replayed from the new state while it still comes back that day', async () => {
    const id = L('5-7')
    const e = await env()
    const s = new e.Session()
    s.answer({ id, kind: 'new', grade: GOOD, at: T })
    s.answer({ id, kind: 'learning', grade: GOOD, at: T + 11 * MIN })
    const graduated = e.store.getState().cards[id]
    expect(graduated.state).toBe(2)
    s.regrade(0, AGAIN) // 1 minute instead of 10: the second answer still happens, now on a card one step back
    expect(s.length).toBe(2)
    const st = e.store.getState()
    expect(st.cards[id].reps).toBe(2)
    expect(st.cards[id].state).not.toBe(2) // the first step was missed, so the second answer did not graduate it
    expect(st.log['2026-11-14']).toMatchObject({ c: 2, n: 1 })
  })

  it('the day’s quest: re-grading the last card of a finished day takes the 50 XP back, and gives it back', async () => {
    const e = await env({ [L('5-1')]: review(-DAY), [L('5-2')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    s.answer({ id: L('5-2'), kind: 'review', grade: GOOD, at: T + MIN })
    expect(e.store.getState()).toMatchObject({ xp: 70 })
    expect(e.store.getState().log['2026-11-14']).toMatchObject({ q: 1, xp: 70 })
    s.regrade(0, AGAIN) // 5-1 comes back: the day is not finished
    let st = e.store.getState()
    expect(st.xp).toBe(20)
    expect(st.log['2026-11-14'].q ?? 0).toBe(0)
    expect(e.srs.buildQueue(st, new Date(T + 2 * MIN)).learning).toBe(1)
    s.regrade(0, EASY)
    st = e.store.getState()
    expect(st.xp).toBe(70)
    expect(st.log['2026-11-14'].q).toBe(1)
  })

  it('reading cards (`:r`) and meaning cards keep their own books', async () => {
    const r = L('5-3') + ':r'
    const e = await env({ [r]: review(-DAY), [L('5-4')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: r, kind: 'review', grade: AGAIN, at: T, quiz: { choices: ['a', 'b', 'c', 'd'], answer: 1, picked: 2 } })
    s.answer({ id: L('5-4'), kind: 'review', grade: GOOD, at: T + MIN })
    s.regrade(0, GOOD)
    const st = e.store.getState()
    expect(st.cards[r].state).toBe(2)
    expect(st.cards[r].lapses).toBe(0)
    expect(st.cards[L('5-3')]).toBeUndefined() // no meaning card appears
    expect(s.entries[0].quiz).toEqual({ choices: ['a', 'b', 'c', 'd'], answer: 1, picked: 2 }) // what was picked stays on record
    expect(st.log['2026-11-14']).toMatchObject({ c: 2, r: 2, p: 2 })
  })

  it('the streak and the day: an answer re-graded keeps the day studied; across midnight each answer stays on its day', async () => {
    const e = await env({ [L('5-1')]: review(-DAY), [L('5-2')]: review(-DAY) })
    const s = new e.Session()
    const late = Date.parse('2026-11-14T23:59:00')
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: late })
    s.answer({ id: L('5-2'), kind: 'review', grade: GOOD, at: late + 2 * MIN })
    s.regrade(0, AGAIN)
    const st = e.store.getState()
    expect(st.log['2026-11-14']).toMatchObject({ c: 1, r: 1, p: 0 })
    expect(st.log['2026-11-15']).toMatchObject({ c: 1, r: 1, p: 1 })
    expect(e.srs.streak(st.log, new Date('2026-11-15T09:00:00'))).toBe(2)
  })
})

describe('undo with the history', () => {
  it('takes back the last answer exactly, and after a re-grade takes back the re-graded state', async () => {
    const e = await env({ [L('5-1')]: review(-DAY), [L('5-2')]: review(-DAY) })
    const s = new e.Session()
    const before = e.learned()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    const one = e.learned()
    s.answer({ id: L('5-2'), kind: 'review', grade: GOOD, at: T + MIN })
    s.regrade(0, AGAIN)
    s.undoLast()
    // 5-2 taken back; 5-1 keeps its new grade
    const st = e.store.getState()
    expect(st.cards[L('5-2')]).toEqual(before.cards[L('5-2')])
    expect(st.cards[L('5-1')].state).toBe(3)
    expect(st.log['2026-11-14']).toMatchObject({ c: 1, p: 0 })
    s.undoLast()
    expect(e.learned()).toEqual(before) // the day's log is gone again, as before the first answer
    expect(one).not.toEqual(before)
  })

  it('keeps "더 하기" unlocked in the meantime', async () => {
    const e = await env({ [L('5-1')]: review(-DAY) })
    const s = new e.Session()
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    e.srs.unlockMoreNew(10, new Date(T))
    s.undoLast()
    expect(e.store.getState().log['2026-11-14']).toEqual({ c: 0, n: 0, r: 0, p: 0, x: 10 })
    s.answer({ id: L('5-1'), kind: 'review', grade: GOOD, at: T })
    e.srs.unlockMoreReviews(50, new Date(T))
    s.regrade(0, AGAIN)
    expect(e.store.getState().log['2026-11-14']).toMatchObject({ c: 1, x: 10, xr: 50 })
  })
})
