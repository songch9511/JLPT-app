// Offline simulation behind the backlog order (03 §5.3): which overdue reviews should come first when there
// are more than a day can hold? Not imported by the app: tests/unit/backlog-sim.test.ts runs a small version
// and checks the conclusion recorded in docs/plan/03-curriculum-dashboard.md §5.3.
//
// The yardstick is how much of the deck is remembered a few weeks after the return (expected recall summed over
// the deck on a fixed later day, `horizon`). It was first written against the exam day the app used to plan for;
// the exam date is gone from the app (2026-11-14), the order it chose is not, and the question it answers — does
// any smarter order keep more words than oldest-due-first — does not depend on an exam.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs'

const DAY = 86_400_000
const MIN = 60_000

/** Small deterministic PRNG so every run can be repeated exactly. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A uniform number fixed by (seed, card, review number): every policy sees the same luck for the same review. */
function luck(seed: number, card: number, n: number) {
  return mulberry32((seed * 7919 + card * 104_729 + n * 1_299_709) | 0)()
}

export type BacklogPolicy = 'due' | 'lowR' | 'gain' | 'wait' | 'highR' | 'random'

export interface BacklogSimOptions {
  /** cards in the deck */
  cards: number
  /** days the deck was built over before the break (new words spread evenly) */
  history: number
  /** days away: no reviews at all */
  away: number
  /** days from the return to the day recall is measured */
  horizon: number
  /** reviews a day after the return */
  cap: number
  trials: number
  seed: number
}

export const BACKLOG_SIM_DEFAULTS: BacklogSimOptions = { cards: 1200, history: 60, away: 7, horizon: 23, cap: 120, trials: 12, seed: 20261114 }

/**
 * Expected recall on the measurement day (sum of R over the deck, `horizon` days after the return) for each policy, per trial. The deck is made by a learner who
 * introduced `cards` words over `history` days and reviewed every card on its due day, answering with the card's
 * recall at that moment (forgotten → 다시, relearned the same day); then stopped for `away` days. From the return
 * on, `cap` reviews a day are done, chosen from everything due by the policy, until the measurement day. No new
 * words are introduced after the return, so only the order differs. Default FSRS parameters, no fuzz.
 *
 * - `due`: oldest due first (the app's order before this change)
 * - `lowR`: lowest recall now first, i.e. most overdue relative to stability (elapsed / S)
 * - `gain`: largest one-step benefit on the measurement day first: r·R_T(알아요) + (1−r)·R_T(다시) − R_T(no review)
 * - `wait`: largest benefit of reviewing today over reviewing when the backlog would reach it (today + the
 *   days the queue needs at `cap` a day), each one step: the measurement-day value of the gain that waiting loses
 * - `highR`, `random`: for contrast
 */
export function simulateBacklog(opts: Partial<BacklogSimOptions> = {}, policies: BacklogPolicy[] = ['due', 'lowR', 'gain', 'wait', 'highR', 'random']) {
  const o = { ...BACKLOG_SIM_DEFAULTS, ...opts }
  const model = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))
  const R = (c: Card, at: number) => (c.state === State.New ? 0 : model.get_retrievability(c, new Date(at), false))
  const out: Record<BacklogPolicy, number[]> = { due: [], lowR: [], gain: [], wait: [], highR: [], random: [] }
  const backlogs: number[] = []

  /** Answer card `i` at `at` with the policy-independent luck of its `n`-th review; a lapse is relearned the same day. */
  const review = (c: Card, at: number, seed: number, i: number, n: number) => {
    const recalled = luck(seed, i, n) < R(c, at)
    let next = model.next(c, new Date(at), recalled ? Rating.Good : Rating.Again).card
    // learning and relearning steps are repeated in the session until passed
    for (let k = 0; k < 4 && next.state !== State.Review; k++) next = model.next(next, new Date(Math.max(at, next.due.getTime())), Rating.Good).card
    return next
  }

  for (let trial = 0; trial < o.trials; trial++) {
    const seed = o.seed + trial
    const t0 = Date.UTC(2026, 0, 1, 0)
    const back = t0 + (o.history + o.away) * DAY
    const end = back + o.horizon * DAY
    // build the deck: card i introduced on day floor(i / perDay), reviewed on every due day until the break
    const perDay = Math.ceil(o.cards / o.history)
    const deck: Card[] = []
    const reps: number[] = []
    for (let i = 0; i < o.cards; i++) {
      let at = t0 + Math.floor(i / perDay) * DAY
      let c = createEmptyCard(new Date(at))
      // first sight: not recalled (as in pnew-sim), learned the same day
      c = model.next(c, new Date(at), Rating.Again).card
      for (let k = 0; k < 4 && c.state !== State.Review; k++) c = model.next(c, new Date(Math.max(at, c.due.getTime())), Rating.Good).card
      let n = 0
      while (c.due.getTime() < t0 + o.history * DAY) {
        at = c.due.getTime()
        c = review(c, at, seed ^ 0x5bd1e995, i, n++)
      }
      deck.push(c)
      reps.push(0)
    }
    backlogs.push(deck.filter((c) => c.due.getTime() < back + DAY).length)

    for (const policy of policies) {
      const cards = deck.slice()
      const n = reps.slice()
      const rnd = mulberry32(seed * 31 + 7)
      for (let day = 0; day < o.horizon; day++) {
        const at = back + day * DAY
        const due: number[] = []
        for (let i = 0; i < cards.length; i++) if (cards[i].due.getTime() < at + DAY) due.push(i)
        const key = (i: number): number => {
          const c = cards[i]
          switch (policy) {
            case 'due':
              return c.due.getTime()
            case 'lowR':
              return R(c, at)
            case 'highR':
              return -R(c, at)
            case 'random':
              return rnd()
            case 'wait':
              return 0
            case 'gain': {
              const r = R(c, at)
              const g = model.next(c, new Date(at), Rating.Good).card
              const again = model.next(c, new Date(at), Rating.Again).card
              const relearned = model.next(again, new Date(at + 10 * MIN), Rating.Good).card
              return -(r * R(g, end) + (1 - r) * R(relearned, end) - R(c, end))
            }
          }
        }
        const wait = Math.ceil(due.length / o.cap)
        const step = (c: Card, t: number) => {
          if (t >= end - 9 * 3_600_000) return R(c, end)
          const r = R(c, t)
          const g = model.next(c, new Date(t), Rating.Good).card
          const again = model.next(c, new Date(t), Rating.Again).card
          const relearned = model.next(again, new Date(t + 10 * MIN), Rating.Good).card
          return r * R(g, end) + (1 - r) * R(relearned, end)
        }
        const keys = new Map(due.map((i) => [i, policy === 'wait' ? -(step(cards[i], at) - step(cards[i], at + wait * DAY)) : key(i)]))
        due.sort((a, b) => keys.get(a)! - keys.get(b)! || a - b)
        for (const i of due.slice(0, o.cap)) cards[i] = review(cards[i], at, seed, i, n[i]++)
      }
      out[policy].push(cards.reduce((sum, c) => sum + R(c, end), 0))
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const summary = Object.fromEntries(
    policies.map((p) => {
      const diff = out[p].map((x, i) => x - out.due[i])
      const m = mean(diff)
      const sd = Math.sqrt(diff.reduce((a, d) => a + (d - m) ** 2, 0) / Math.max(1, diff.length - 1))
      return [p, { mean: mean(out[p]), vsDue: m, vsDueSE: sd / Math.sqrt(diff.length) }]
    }),
  ) as Record<BacklogPolicy, { mean: number; vsDue: number; vsDueSE: number }>
  return { options: o, backlog: mean(backlogs), perTrial: out, summary }
}
