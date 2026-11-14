// Exam-day recall of one card when its reviews are done as planned (03 §4.1 multi-step, §4.3). Every number
// comes from ts-fsrs: the forgetting curve (`forgetting_curve`, `get_retrievability`), the memory-state update
// (`next_state`) and the interval (`next_interval`), combined the way its scheduler combines them for a review
// card (tests/unit/projection.test.ts checks this against `next`). Nothing random: each review is remembered with
// the card's recall at that moment ("알아요") or not ("모르겠어요", relearned in the same session), and the two
// outcomes are weighted by their probabilities.
//
// Speed: the first review of each card, and the one after it when remembered, are computed exactly; what follows is read from a table of expected values
// over a grid of memory states (stability in 5% steps, difficulty in 0.5 steps) × days left, filled once by
// backward induction and interpolated. That keeps 8,000 cards at a few milliseconds of table work plus a few
// microseconds per card, whatever the horizon. The rounding is checked against the exact recursion in tests.
import { computeDecayFactor, fsrs, generatorParameters, Rating, State as CardState } from 'ts-fsrs'
import { toCard } from './srs'
import type { SCard } from './store'

// Same parameters as the app's scheduler but without fuzz, so the projection is deterministic.
const model = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))

const DAY = 86_400_000
/** The relearning step after a lapse (ts-fsrs default `10m`), answered "알아요" in the same session. */
export const RELEARN_MS = 10 * 60_000

/** Days on the UTC calendar between two times: the elapsed days ts-fsrs's scheduler uses for a review. */
const calDays = (from: number, to: number) => Math.floor(to / DAY) - Math.floor(from / DAY)
/** Whole days between two times: the elapsed days of `get_retrievability`. */
const floorDays = (from: number, to: number) => Math.floor((to - from) / DAY)
const fc = (days: number, s: number) => model.forgetting_curve(Math.max(0, days), s)
// The table evaluates the curve hundreds of thousands of times: the same curve with ts-fsrs's own constants, without
// its per-call constant recomputation and 8-place rounding (tests check it equals `forgetting_curve`).
const { decay: DECAY, factor: FACTOR } = computeDecayFactor(model.parameters.w)
export const curve = (days: number, s: number) => Math.pow(1 + (FACTOR * Math.max(0, days)) / s, DECAY)
const ivl = (s: number) => model.next_interval(s, 0)
const clamp01 = (r: number) => (Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0)

/** A review-state card right after a review: its memory state and the days until it is due again. */
export interface After {
  s: number
  d: number
  /** interval in days */
  i: number
}

/** "알아요" on a review card `t` days (the scheduler's count) after its last review, as ts-fsrs's `next` does it. */
export function afterGood(s: number, d: number, t: number, r: number): After {
  const good = model.next_state({ stability: s, difficulty: d }, t, Rating.Good, r)
  const hard = model.next_state({ stability: s, difficulty: d }, t, Rating.Hard, r)
  // the scheduler keeps the Good interval at least a day longer than Hard's
  const hardIvl = Math.min(ivl(hard.stability), ivl(good.stability))
  return { s: good.stability, d: good.difficulty, i: Math.max(ivl(good.stability), hardIvl + 1) }
}

/** "모르겠어요" on a review card, then its relearning step answered "알아요" `t2` days later (0 within the session). */
export function afterLapse(s: number, d: number, t: number, r: number, t2: number): After {
  const again = model.next_state({ stability: s, difficulty: d }, t, Rating.Again, r)
  const relearned = model.next_state(again, t2, Rating.Good)
  return { s: relearned.stability, d: relearned.difficulty, i: ivl(relearned.stability) }
}

// ── the table ───────────────────────────────────────────────────────────────

const S_LOG = Math.log(1.05)
const D_STEP = 0.5
const D_BINS = Math.round(9 / D_STEP) // difficulty 1…10
/** Grid states after "알아요" (interval at least 2 days, as the scheduler's Hard/Good rule gives for small S) or after relearning. */
const GOOD = 0
const RELEARNED = 1

interface Node {
  s: number
  d: number
  i: number
  r: number
  good: Corners | null
  lapse: Corners | null
  /** expected exam-day recall with h = 0…H whole days left */
  v: Float32Array
}
/** Bilinear interpolation between four grid nodes: their value vectors and weights. */
interface Corners {
  v0: Float32Array
  v1: Float32Array
  v2: Float32Array
  v3: Float32Array
  w0: number
  w1: number
  w2: number
  w3: number
}

let H = -1
let nodes = new Map<number, Node>()
let pending: Node[] = []

function node(fam: number, si: number, di: number): Node {
  const key = fam * 1e7 + (si + 2000) * 100 + di
  let n = nodes.get(key)
  if (n) return n
  const s = Math.exp(si * S_LOG)
  const d = 1 + di * D_STEP
  const i = fam === GOOD ? Math.max(2, ivl(s)) : ivl(s)
  n = { s, d, i, r: fc(i, s), good: null, lapse: null, v: new Float32Array(H + 1) }
  nodes.set(key, n)
  pending.push(n)
  return n
}

function corners(fam: number, a: After): Corners {
  const x = Math.log(Math.max(a.s, 1e-3)) / S_LOG
  const si = Math.floor(x)
  const fx = x - si
  const y = Math.min(D_BINS, Math.max(0, (a.d - 1) / D_STEP))
  const di = Math.min(D_BINS - 1, Math.floor(y))
  const fy = y - di
  return {
    v0: node(fam, si, di).v,
    v1: node(fam, si + 1, di).v,
    v2: node(fam, si, di + 1).v,
    v3: node(fam, si + 1, di + 1).v,
    w0: (1 - fx) * (1 - fy),
    w1: fx * (1 - fy),
    w2: (1 - fx) * fy,
    w3: fx * fy,
  }
}

const at = (c: Corners, h: number) => c.v0[h] * c.w0 + c.v1[h] * c.w1 + c.v2[h] * c.w2 + c.v3[h] * c.w3

/** Fill every node created since the last call: their successors first (closure), then all of them day by day. */
function settle() {
  if (!pending.length) return
  const inner: Node[] = []
  // closure: a node whose next review falls inside the horizon needs both successors
  for (let k = 0; k < pending.length; k++) {
    const n = pending[k]
    // until its next review the node only forgets
    for (let h = 0; h <= Math.min(n.i, H); h++) n.v[h] = curve(h, n.s)
    if (n.i < H) {
      n.good = corners(GOOD, afterGood(n.s, n.d, n.i, n.r))
      n.lapse = corners(RELEARNED, afterLapse(n.s, n.d, n.i, n.r, 0))
      inner.push(n)
    }
  }
  pending = []
  // a value at h needs successors at h − i < h only: fill h in increasing order
  for (let h = 1; h <= H; h++)
    for (const n of inner) if (h > n.i) n.v[h] = n.r * at(n.good!, h - n.i) + (1 - n.r) * at(n.lapse!, h - n.i)
}

/** Make the table cover `h` days; a longer horizon than before starts it again. */
function horizon(h: number) {
  if (h <= H) return
  H = Math.max(h, 32)
  nodes = new Map()
  pending = []
}

/** Expected exam-day recall of a card just reviewed into state `a` with `h` whole days left (table, interpolated). */
function continuation(a: After, fam: number, h: number): number {
  if (h <= 0 || a.i >= h) return fc(h, a.s)
  horizon(h)
  const c = corners(fam, a)
  settle()
  return at(c, h)
}

/**
 * One more exact review from state `a`, then the table: the card's own interval decides whether its next review
 * falls before the exam, and only the states after that review are interpolated.
 */
function stepThenTable(a: After, h: number): number {
  if (h <= 0 || a.i >= h) return fc(h, a.s)
  const r = fc(a.i, a.s)
  return r * continuation(afterGood(a.s, a.d, a.i, r), GOOD, h - a.i) + (1 - r) * continuation(afterLapse(a.s, a.d, a.i, r, 0), RELEARNED, h - a.i)
}

/** The same without the table: every branch followed exactly (exponential; for tests and small cases). */
export function continuationExact(a: After, h: number): number {
  if (h <= 0 || a.i >= h) return fc(h, a.s)
  const r = fc(a.i, a.s)
  return r * continuationExact(afterGood(a.s, a.d, a.i, r), h - a.i) + (1 - r) * continuationExact(afterLapse(a.s, a.d, a.i, r, 0), h - a.i)
}

/**
 * Recall at `t` if nothing more is studied: what ts-fsrs `get_retrievability` gives (whole days since the last
 * review, stability to 8 places; 0 for a card never reviewed), without building a Card for it.
 */
export function recallAt(c: SCard, t: number): number {
  if (c.state === CardState.New || c.last_review === undefined) return clamp01(model.get_retrievability(toCard(c), new Date(t), false))
  return clamp01(fc(floorDays(c.last_review, t), +c.stability.toFixed(8)))
}

/**
 * Expected recall on the exam (at `exam`) of a card whose next review is done at `at`, with every later review
 * done on its due day: a review card is remembered with its recall at `at`; a learning or relearning card
 * finishes its steps that day ("알아요": the session repeats them until passed). A later review counts when its due
 * day leaves at least one whole day before the exam morning. `exact` follows every branch without the table.
 */
export function examRecall(c: SCard, at: number, exam: number, exact = false): number {
  const cont = (a: After, h: number) => (exact ? continuationExact(a, h) : stepThenTable(a, h))
  try {
    const last = c.last_review ?? c.due - c.scheduled_days * DAY
    const t = Math.max(at, last)
    if (c.state === CardState.Review) {
      // the recall get_retrievability gives (whole days), without building a Card
      const p = clamp01(fc(floorDays(last, t), +c.stability.toFixed(8)))
      const r = fc(calDays(last, t), c.stability)
      const good = afterGood(c.stability, c.difficulty, calDays(last, t), r)
      const lapse = afterLapse(c.stability, c.difficulty, calDays(last, t), r, calDays(t, t + RELEARN_MS))
      const hl = floorDays(t + RELEARN_MS, exam)
      // the lapse branch (weight 1 − p, small) goes to the table directly
      return clamp01(p * cont(good, floorDays(t, exam)) + (1 - p) * (exact ? continuationExact(lapse, hl) : continuation(lapse, RELEARNED, hl)))
    }
    // learning steps: answered "알아요" until the card reaches review
    let card = toCard(c)
    let when = t
    for (let k = 0; k < 4 && card.state !== CardState.Review; k++) {
      when = Math.max(when, card.due.getTime())
      card = model.next(card, new Date(when), Rating.Good).card
    }
    if (card.state !== CardState.Review) return recallAt(c, exam)
    return clamp01(cont({ s: card.stability, d: card.difficulty, i: card.scheduled_days }, floorDays(when, exam)))
  } catch {
    // a card ts-fsrs cannot schedule (corrupt values) counts with its recall if left alone
    return recallAt(c, exam)
  }
}

/** Grid nodes in the table now (for the performance test). */
export const tableSize = () => nodes.size
