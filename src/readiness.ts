// Exam readiness (03 §4): how many words of the study list the learner is expected to recall on the exam
// morning. Recall comes from ts-fsrs's own forgetting curve (`get_retrievability`) and scheduler (`next`);
// nothing here re-derives the formula.
import { fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs'
import { COUNTS, wordOfCard, type Level } from './data'
import { pNew } from './pnew'
import { endOfDay, isActive, newLeftToday, studyLevels, toCard } from './srs'
import { MAX_DAILY_NEW, type SCard, type State } from './store'
import { addDays, dayKey, daysBetween, parseDay } from './util'

const HOUR = 3_600_000
/** The exam is taken in the morning: recall is measured at 09:00 local time on the exam day. */
export const EXAM_HOUR = 9
/** No status is given until this many review answers exist (03 §4.2). */
export const MIN_REVIEWS_FOR_STATUS = 30
/** The calibration of §4.1 applies when the last 30 days' recall is this far below the prediction. */
const CALIBRATION_GAP = 0.05

// Same parameters as the app's scheduler but without fuzz, so the projection is deterministic.
const model = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))

export const examTime = (examDate: string) => {
  const d = parseDay(examDate)
  d.setHours(EXAM_HOUR)
  return d.getTime()
}

/** Card ids are `<level>-<idx>` with an optional `:<type>` suffix for further card types of the same word (03 §3). */
export { wordOfCard }

const safe = (r: number) => (Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0)

/** Probability of recalling a card at `at` (FSRS-6 forgetting curve, via ts-fsrs). */
export function recallAt(c: SCard | Card, at: number): number {
  const card = typeof c.due === 'number' ? toCard(c as SCard) : (c as Card)
  return safe(model.get_retrievability(card, new Date(at), false))
}

/**
 * Recall on the exam if the card is reviewed once more at `at` (03 §4.1 lookahead): remembered with the
 * card's recall at that moment, then the exam-day recall of the "알아요" or "모르겠어요" outcome.
 */
export function recallAfterReview(c: SCard, at: number, exam: number): number {
  const card = toCard(c)
  const when = new Date(Math.max(at, c.last_review ?? 0))
  const r = recallAt(card, when.getTime())
  const good = model.next(card, when, Rating.Good).card
  const again = model.next(card, when, Rating.Again).card
  return r * recallAt(good, exam) + (1 - r) * recallAt(again, exam)
}

interface CardTerms {
  key: string
  /** exam-day recall if nothing more is studied */
  stop: number
  /** …if the plan is followed: reviewed once more when due before the exam */
  plan: number
  /** …if today is skipped and the plan resumes tomorrow */
  skip: number
}
const termCache = new WeakMap<SCard, CardTerms>()

function cardTerms(c: SCard, exam: number, nowQ: number, eod: number, examDay: boolean): CardTerms {
  // only what the result depends on: the review time moves with the clock for overdue cards alone
  const key = `${exam}|${c.due < nowQ ? nowQ : 0}|${c.due < eod ? eod : 0}|${examDay ? 1 : 0}`
  const hit = termCache.get(c)
  if (hit && hit.key === key) return hit
  const stop = recallAt(c, exam)
  let plan = stop
  let skip = stop
  if (!examDay && c.due < exam) {
    plan = recallAfterReview(c, Math.max(c.due, nowQ), exam)
    // skipping today moves today's reviews to tomorrow, or past the exam if tomorrow is the exam day
    skip = c.due >= eod ? plan : eod < exam ? recallAfterReview(c, Math.max(c.due, eod), exam) : stop
  }
  const t = { key, stop, plan, skip }
  termCache.set(c, t)
  return t
}

export type ReadinessStatus = 'ontrack' | 'tight' | 'risk' | 'early'

export interface Readiness {
  /** no exam ahead: the exam date is past (03 §4.2 asks for the next date instead of a figure) */
  past: boolean
  examDay: boolean
  daysLeft: number
  levels: Level[]
  /** words in the study list (|W|) */
  total: number
  /** the goal share and the goal in words, G = ⌈goal · |W|⌉ */
  goal: number
  goalWords: number
  /** E_now: expected words recalled on the exam if studying stopped now */
  stop: number
  /** E_plan: …if the plan is followed (one more review of every card due before the exam, plus new words) */
  plan: number
  /** E_plan minus E_plan with today skipped: what today's session adds */
  todayGain: number
  /** words the plan still introduces before the exam (today's included) */
  plannedNew: number
  /** words not yet introduced */
  unseen: number
  status: ReadinessStatus
  /** recall over the last 30 days was lower than predicted and every figure was scaled down (03 §4.1) */
  calibrated: boolean
  /** the factor applied (1 when not calibrated) */
  factor: number
}

/** Scale factor from comparing actual and predicted recall of the last 30 days' reviews (03 §4.1). */
export function calibration(s: State, now: Date): number {
  let r = 0
  let p = 0
  let e = 0
  for (let i = 0; i < 30; i++) {
    const log = s.log[dayKey(addDays(now, -i))]
    // only days where the prediction was recorded can be compared
    if (log?.e !== undefined && log.r > 0) {
      r += log.r
      p += log.p
      e += log.e
    }
  }
  if (r < MIN_REVIEWS_FOR_STATUS || e <= 0) return 1
  return p / r < e / r - CALIBRATION_GAP ? p / e : 1
}

function reviewAnswers(s: State): number {
  let n = 0
  for (const k in s.log) n += s.log[k].r
  return n
}

/** Introductions per day until the exam: today `today` words, then `daily` a day, until `left` runs out. */
function newWordsTerm(left: number, today: number, daily: number, daysLeft: number, skipToday: boolean) {
  let sum = 0
  let introduced = 0
  for (let k = skipToday ? 1 : 0; k < daysLeft && left > 0; k++) {
    const n = Math.min(left, k === 0 ? today : daily)
    sum += n * pNew(daysLeft - k)
    introduced += n
    left -= n
  }
  return { sum, introduced }
}

let memo: { args: unknown[]; value: Readiness } | null = null

/**
 * Readiness for the exam in `s.settings.examDate`. `dailyNew` replaces the daily new-word setting, to ask
 * what a different pace would give. Results are memoised on the state's parts and the hour, and each card's
 * terms are cached on the card object, so re-rendering or answering one card stays cheap.
 */
export function readiness(s: State, now: Date, opts: { dailyNew?: number } = {}): Readiness {
  const nowQ = Math.floor(now.getTime() / HOUR) * HOUR
  const args = [s.cards, s.log, s.settings, nowQ, dayKey(now), opts.dailyNew]
  if (memo && memo.args.every((a, i) => a === args[i])) return memo.value

  const { examDate, goal } = s.settings
  const levels = studyLevels(s.settings)
  const total = levels.reduce((n, l) => n + COUNTS[l], 0)
  const goalWords = Math.ceil(goal * total)
  const exam = examTime(examDate)
  const daysLeft = daysBetween(now, parseDay(examDate))
  // the exam day itself is not "past": there is just nothing left to plan (03 §5.4 D-day)
  const past = daysLeft < 0
  const examDay = daysLeft === 0
  const eod = endOfDay(now)

  // a word's probability is that of its weakest card (03 §4.1); words without a card count 0. A word with a
  // meaning and a reading card counts once; resting reading cards (fast-track off) do not count.
  const inLevels = new Set<number>(levels)
  const words = new Map<string, CardTerms>()
  const ft = s.settings.fastTrack !== false
  for (const id in s.cards) {
    if (!inLevels.has(Number(id[0])) || !isActive(id, ft)) continue
    const t = cardTerms(s.cards[id], exam, nowQ, eod, examDay)
    const w = wordOfCard(id)
    const prev = words.get(w)
    words.set(w, prev ? { key: '', stop: Math.min(prev.stop, t.stop), plan: Math.min(prev.plan, t.plan), skip: Math.min(prev.skip, t.skip) } : t)
  }
  let stop = 0
  let plan = 0
  let skip = 0
  for (const t of words.values()) {
    stop += t.stop
    plan += t.plan
    skip += t.skip
  }

  const unseen = Math.max(0, total - words.size)
  const daily = Math.min(MAX_DAILY_NEW, opts.dailyNew ?? s.settings.dailyNew)
  const today = newLeftToday(s, now, daily)
  const fresh = past || examDay ? { sum: 0, introduced: 0 } : newWordsTerm(unseen, today, daily, daysLeft, false)
  const freshSkip = past || examDay ? { sum: 0, introduced: 0 } : newWordsTerm(unseen, today, daily, daysLeft, true)
  plan += fresh.sum
  skip += freshSkip.sum

  const factor = calibration(s, now)
  stop *= factor
  plan *= factor
  skip *= factor

  const status: ReadinessStatus =
    reviewAnswers(s) < MIN_REVIEWS_FOR_STATUS ? 'early' : plan >= goalWords ? 'ontrack' : plan >= 0.9 * goalWords ? 'tight' : 'risk'

  const value: Readiness = {
    past,
    examDay,
    daysLeft,
    levels,
    total,
    goal,
    goalWords,
    stop,
    plan,
    todayGain: Math.max(0, plan - skip),
    plannedNew: fresh.introduced,
    unseen,
    status,
    calibrated: factor < 1,
    factor,
  }
  if (!opts.dailyNew) memo = { args, value }
  return value
}

/** Daily new-word paces offered as the one lever when the plan falls short (03 §4.3), never above the cap. */
export const PACES = [5, 10, 15, 20, 25, 30, 35, 40].filter((n) => n <= MAX_DAILY_NEW)

/**
 * The smallest faster pace that reaches the goal, `null` when the plan already reaches it (or there is
 * nothing to decide), or `'none'` when even the fastest pace falls short.
 */
export function paceToGoal(s: State, now: Date): number | null | 'none' {
  const r = readiness(s, now)
  if (r.past || r.examDay || r.plan >= r.goalWords || r.unseen === 0) return null
  for (const n of PACES) if (n > s.settings.dailyNew && readiness(s, now, { dailyNew: n }).plan >= r.goalWords) return n
  return 'none'
}
