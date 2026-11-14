import { describe, expect, it } from 'vitest'
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs'
import { card, DAY, MIN } from './helpers'
import { afterGood, afterLapse, continuationExact, curve, examRecall, recallAt } from '../../src/projection'
import { mulberry32 } from '../../src/backlog-sim'
import type { SCard } from '../../src/store'

const T = Date.parse('2026-11-13T09:00:00+09:00')
const model = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))
const toCard = (c: SCard): Card => ({ ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined }) as Card
/** A review card last reviewed `ago` days before T (plus a few hours, so day counts are not all whole) with stability `s`. */
const rev = (s: number, d: number, ago: number) =>
  card({ due: T, last_review: T - ago * DAY - 5 * 3_600_000, stability: s, difficulty: d, scheduled_days: ago })

describe('the FSRS steps of the projection are the scheduler’s own', () => {
  it('“알아요” on a review card: stability, difficulty and interval equal ts-fsrs next (Good)', () => {
    for (const s of [0.4, 1, 2.3, 7, 30, 120]) for (const d of [1.5, 5, 9.6]) for (const ago of [0, 1, 4, 20]) {
      const c = rev(s, d, ago)
      const next = model.next(toCard(c), new Date(T), Rating.Good).card
      const t = Math.floor(T / DAY) - Math.floor(c.last_review! / DAY)
      const a = afterGood(s, d, t, model.forgetting_curve(t, s))
      expect([a.s, a.d, a.i]).toEqual([next.stability, next.difficulty, next.scheduled_days])
    }
  })

  it('“모르겠어요” then the relearning step “알아요” 10 minutes later: equal to ts-fsrs Again → Good', () => {
    for (const s of [0.4, 2.3, 30]) for (const d of [1.5, 9.6]) for (const ago of [1, 9]) {
      const c = rev(s, d, ago)
      const again = model.next(toCard(c), new Date(T), Rating.Again).card
      expect(again.state).toBe(State.Relearning)
      const back = model.next(again, new Date(T + 10 * MIN), Rating.Good).card
      expect(back.state).toBe(State.Review)
      const t = Math.floor(T / DAY) - Math.floor(c.last_review! / DAY)
      const a = afterLapse(s, d, t, model.forgetting_curve(t, s), 0)
      expect([a.s, a.d, a.i]).toEqual([back.stability, back.difficulty, back.scheduled_days])
    }
  })

  it('the table’s curve is ts-fsrs’s forgetting curve; recallAt is get_retrievability', () => {
    for (const s of [0.01, 0.7, 3, 40, 900]) for (const t of [0, 1, 5, 33, 400]) expect(curve(t, s)).toBeCloseTo(model.forgetting_curve(t, s), 7)
    for (const ago of [0, 1, 7, 30]) {
      const c = rev(3.3, 5, ago)
      for (const t of [T, T + 5 * DAY + 7 * MIN]) expect(recallAt(c, t)).toBe(model.get_retrievability(toCard(c), new Date(t), false))
    }
  })
})

describe('examRecall: hand-checkable cases', () => {
  it('a strong card whose next interval after either answer passes the exam: exactly the one-step lookahead', () => {
    const c = rev(200, 5, 150)
    const exam = T + 3 * DAY
    const R = (k: Card, at: number) => model.get_retrievability(k, new Date(at), false)
    const good = model.next(toCard(c), new Date(T), Rating.Good).card
    const lapse = model.next(model.next(toCard(c), new Date(T), Rating.Again).card, new Date(T + 10 * MIN), Rating.Good).card
    expect(Math.min(good.scheduled_days, lapse.scheduled_days)).toBeGreaterThanOrEqual(3)
    const p = recallAt(c, T)
    const byHand = p * R(good, exam) + (1 - p) * R(lapse, exam)
    expect(examRecall(c, T, exam, true)).toBeCloseTo(byHand, 9)
    expect(examRecall(c, T, exam)).toBeCloseTo(byHand, 9)
  })

  it('agrees with a Monte Carlo run of ts-fsrs next (reviews on their due day, each answered with the recall then)', () => {
    const rng = mulberry32(7)
    for (const [s, d, ago, days] of [
      [2.3, 5, 3, 14],
      [6, 7, 7, 23],
      [1, 9, 2, 10],
    ] as const) {
      const c = rev(s, d, ago)
      const exam = T + days * DAY
      const n = 4000
      let sum = 0
      for (let k = 0; k < n; k++) {
        let x = toCard(c)
        let at = T
        for (;;) {
          const ok = rng() < model.get_retrievability(x, new Date(at), false)
          x = model.next(x, new Date(at), ok ? Rating.Good : Rating.Again).card
          if (!ok) x = model.next(x, new Date(at + 10 * MIN), Rating.Good).card
          // the next review happens when its due day leaves a whole day before the exam morning
          const last = x.last_review!.getTime()
          if (x.scheduled_days >= Math.floor((exam - last) / DAY)) break
          at = last + x.scheduled_days * DAY
        }
        sum += model.get_retrievability(x, new Date(exam), false)
      }
      const mc = sum / n
      // 4,000 runs: standard error well under 0.01
      expect(examRecall(c, T, exam, true), `S=${s}`).toBeCloseTo(mc, 1)
      expect(Math.abs(examRecall(c, T, exam, true) - mc), `S=${s}`).toBeLessThan(0.015)
    }
  })
})

describe('examRecall: the table against the exact recursion', () => {
  it('within 0.005 per card on average and 0.02 at worst, for horizons up to 3 weeks', () => {
    let worst = 0
    let sum = 0
    let n = 0
    for (const days of [4, 9, 16, 21]) for (const s of [1, 2.3, 5, 12, 30]) for (const d of [2, 6, 9.5]) for (const ago of [1, 5]) {
      const c = rev(s, d, ago)
      const e = Math.abs(examRecall(c, T, T + days * DAY) - examRecall(c, T, T + days * DAY, true))
      worst = Math.max(worst, e)
      sum += e
      n++
    }
    console.log('table vs exact: mean', (sum / n).toFixed(4), 'worst', worst.toFixed(4))
    expect(sum / n).toBeLessThan(0.005)
    expect(worst).toBeLessThan(0.02)
  })

  it('stays between 0 and 1 and is deterministic; a review never makes the expected exam recall fall below leaving it', () => {
    for (const s of [0.5, 3, 20]) for (const days of [1, 2, 30, 200]) {
      const c = rev(s, 5, 3)
      const v = examRecall(c, T, T + days * DAY)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(examRecall(c, T, T + days * DAY)).toBe(v)
      expect(v).toBeGreaterThanOrEqual(recallAt(c, T + days * DAY) - 1e-6)
    }
  })

  it('a learning card finishes its steps and then follows its reviews', () => {
    const fresh = model.next(createEmptyCard(new Date(T)), new Date(T), Rating.Good).card
    const c: SCard = { ...fresh, due: fresh.due.getTime(), last_review: fresh.last_review!.getTime() }
    const v = examRecall(c, fresh.due.getTime(), T + 20 * DAY)
    expect(v).toBeGreaterThan(0.8)
    expect(v).toBeLessThanOrEqual(1)
  })

  it('the exact recursion with no review before the exam is the forgetting curve', () => {
    expect(continuationExact({ s: 10, d: 5, i: 12 }, 7)).toBeCloseTo(model.forgetting_curve(7, 10), 12)
  })
})
