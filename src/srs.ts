// Spaced repetition on top of FSRS (the open scheduler Anki uses): every answer moves a card's
// next review further out when remembered and brings it back within minutes when forgotten.
import { createEmptyCard, fsrs, generatorParameters, Rating, State as CardState, type Card, type Grade } from 'ts-fsrs'
import { COUNTS, LEVELS, levelOf, wordId, type Level } from './data'
import { getState, MAX_DAILY_NEW, update, type DayLog, type SCard, type State } from './store'
import { addDays, dayKey, daysBetween } from './util'

export { Rating }
export type { Grade }

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))

/** Cards still in (re)learning are shown this far ahead of their due time rather than making the user wait. */
const LEARN_AHEAD_MS = 20 * 60_000
/** A review card counts as long-term memory once its interval reaches three weeks (Anki's "mature"). */
const MATURE_DAYS = 21
export const LEECH_LAPSES = 2

export const toCard = (c: SCard): Card => ({ ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined })
const fromCard = (c: Card): SCard => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.getTime(),
})

/**
 * FSRS refuses to schedule a card at a time before its last review (it throws), which happens when the
 * device clock goes backwards or a backup comes from a device whose clock ran ahead. Schedule such a card
 * as if it were being answered right at its last review instead.
 */
export const reviewTime = (c: SCard | undefined, now: Date) => (c?.last_review && c.last_review > now.getTime() ? new Date(c.last_review) : now)

const isLearning = (c: SCard) => c.state === CardState.Learning || c.state === CardState.Relearning

export function endOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
}

const emptyLog = (): DayLog => ({ c: 0, n: 0, r: 0, p: 0 })

// ── today's queue ───────────────────────────────────────────────────────────

export type Kind = 'new' | 'learning' | 'review'
export interface Queue {
  learning: number
  review: number
  fresh: number
  /** the card to show now, if any */
  next: { id: string; kind: Kind } | null
  /** learning cards that come back later today (beyond the learn-ahead window) */
  waiting: number
  /** when the first of the waiting learning cards comes due (null when none wait) */
  nextDue: number | null
}

/**
 * The levels whose words are studied and counted for readiness: the target alone, or with `includeLower`
 * the target and every level below it, easiest first (03 §2.1 P4: the exam assumes the lower levels' words).
 */
export function studyLevels(settings: Pick<State['settings'], 'target' | 'includeLower'>): Level[] {
  return settings.includeLower ? LEVELS.filter((l) => l >= settings.target) : [settings.target]
}

function nextNewIds(s: State, limit: number): string[] {
  const out: string[] = []
  for (const l of studyLevels(s.settings))
    for (let i = 0; i < COUNTS[l] && out.length < limit; i++) {
      const id = wordId(l, i)
      if (!s.cards[id]) out.push(id)
    }
  return out
}

/** Words not yet introduced in the levels being studied. */
export function newWordsLeft(s: State): number {
  const b = breakdowns(s)
  return studyLevels(s.settings).reduce((n, l) => n + b[l].new, 0)
}

/** New words still allowed today: the daily setting (never above MAX_DAILY_NEW) plus extras unlocked today. */
export function newLeftToday(s: State, now: Date, dailyNew = s.settings.dailyNew): number {
  const log = s.log[dayKey(now)]
  return Math.max(0, Math.min(MAX_DAILY_NEW, dailyNew) + (log?.x ?? 0) - (log?.n ?? 0))
}

/**
 * `avoid` keeps the card just answered from reappearing immediately when something else is available.
 * `finishNow` shows learning cards that come back later today right away, so a session never has to wait
 * for them (03 §5.2 P7).
 */
export function buildQueue(s: State, now: Date, avoid?: string, opts: { finishNow?: boolean } = {}): Queue {
  const t = now.getTime()
  const eod = endOfDay(now)
  const learning: [string, number][] = []
  const review: [string, number][] = []
  for (const id in s.cards) {
    const c = s.cards[id]
    if (isLearning(c)) {
      if (c.due < eod) learning.push([id, c.due])
    } else if (c.due < eod) review.push([id, c.due])
  }
  learning.sort((a, b) => a[1] - b[1])
  review.sort((a, b) => a[1] - b[1])
  const fresh = nextNewIds(s, newLeftToday(s, now))

  const ready = opts.finishNow ? learning : learning.filter(([, due]) => due <= t + LEARN_AHEAD_MS)
  const dueNow = ready.filter(([, due]) => due <= t)
  const answered = s.log[dayKey(now)]?.c ?? 0
  // New words are sprinkled between reviews (every 4th card) instead of piling up at the end.
  const newFirst = fresh.length > 0 && (review.length === 0 || answered % 4 === 3)

  const candidates: { id: string; kind: Kind }[] = [
    ...dueNow.map(([id]) => ({ id, kind: 'learning' as const })),
    ...(newFirst ? [{ id: fresh[0], kind: 'new' as const }] : []),
    ...review.slice(0, 2).map(([id]) => ({ id, kind: 'review' as const })),
    ...fresh.slice(0, 2).map((id) => ({ id, kind: 'new' as const })),
    ...ready.map(([id]) => ({ id, kind: 'learning' as const })),
  ]
  const next = candidates.find((c) => c.id !== avoid) ?? candidates[0] ?? null

  const waiting = learning.length - ready.length
  const nextDue = waiting > 0 ? learning[ready.length][1] : null
  return { learning: learning.length, review: review.length, fresh: fresh.length, next, waiting, nextDue }
}

// ── answering ───────────────────────────────────────────────────────────────

/** Time on one card counts up to this much: a card left on screen while the learner is away is not study. */
export const MAX_CARD_MS = 60_000

/**
 * Returns the XP earned by this answer (card XP plus any quest it completed). `activeMs` is how long the
 * card was on screen and visible before the answer; it is added to the day's study time.
 */
export function answer(id: string, grade: Grade, now = new Date(), activeMs?: number): number {
  let gained = 0
  update((d) => {
    const prev = d.cards[id]
    const at = reviewTime(prev, now)
    const card = prev ? toCard(prev) : createEmptyCard(now)
    const { card: next } = scheduler.next(card, at, grade)
    d.cards = { ...d.cards, [id]: fromCard(next) }
    const key = dayKey(now)
    const log = { ...(d.log[key] ?? emptyLog()) }
    log.c++
    if (!prev) log.n++
    if (prev?.state === CardState.Review) {
      log.r++
      if (grade !== Rating.Again) log.p++
      // what the model expected, so readiness can be corrected if the learner remembers less (03 §4.1)
      const predicted = scheduler.get_retrievability(card, at, false)
      if (Number.isFinite(predicted)) log.e = (log.e ?? 0) + predicted
    }
    if (activeMs !== undefined && Number.isFinite(activeMs) && activeMs > 0) log.ms = (log.ms ?? 0) + Math.min(MAX_CARD_MS, Math.round(activeMs))
    d.log = { ...d.log, [key]: log }

    gained = XP_PER_CARD
    quests(d, now).forEach((q, i) => {
      if (q.done && !((log.q ?? 0) & (1 << i))) {
        log.q = (log.q ?? 0) | (1 << i)
        gained += q.xp
      }
    })
    log.xp = (log.xp ?? 0) + gained
    d.xp += gained
  })
  return gained
}

export type Snapshot = Pick<State, 'cards' | 'log' | 'xp'>
export const snapshot = (): Snapshot => ({ cards: getState().cards, log: getState().log, xp: getState().xp })
export function restore(s: Snapshot) {
  update((d) => {
    d.cards = s.cards
    d.log = s.log
    d.xp = s.xp
  })
}

export function unlockMoreNew(n: number, now = new Date()) {
  update((d) => {
    const key = dayKey(now)
    const log = { ...(d.log[key] ?? emptyLog()) }
    log.x = (log.x ?? 0) + n
    d.log = { ...d.log, [key]: log }
  })
}

/** How long until the card returns for each answer, e.g. "10분", "4일". */
export function previewIntervals(s: State, id: string, now: Date): Record<Grade, string> {
  const prev = s.cards[id]
  const rec = scheduler.repeat(prev ? toCard(prev) : createEmptyCard(now), reviewTime(prev, now))
  const fmt = (g: Grade) => formatInterval(rec[g].card.due.getTime() - now.getTime())
  return { [Rating.Again]: fmt(Rating.Again), [Rating.Hard]: fmt(Rating.Hard), [Rating.Good]: fmt(Rating.Good), [Rating.Easy]: fmt(Rating.Easy) } as Record<Grade, string>
}

export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '1분 이내'
  if (min < 60) return `${Math.round(min)}분`
  if (min < 60 * 24) return `${Math.round(min / 60)}시간`
  const days = min / (60 * 24)
  if (days < 30) return `${Math.round(days)}일`
  if (days < 365) return `${Math.round(days / 30)}개월`
  return `${(days / 365).toFixed(1)}년`
}

// ── stats ───────────────────────────────────────────────────────────────────

export type Stage = 'new' | 'learning' | 'young' | 'mature'
export const STAGE_LABEL: Record<Stage, string> = { new: '새 단어', learning: '익히는 중', young: '다지는 중', mature: '장기 기억' }

export function stageOf(c: SCard | undefined): Stage {
  if (!c) return 'new'
  if (isLearning(c)) return 'learning'
  return c.scheduled_days >= MATURE_DAYS ? 'mature' : 'young'
}

export type Breakdown = Record<Stage, number>

export function breakdowns(s: State): Record<Level, Breakdown> {
  const out = Object.fromEntries(
    LEVELS.map((l) => [l, { new: COUNTS[l], learning: 0, young: 0, mature: 0 }]),
  ) as Record<Level, Breakdown>
  for (const id in s.cards) {
    const b = out[levelOf(id)]
    b[stageOf(s.cards[id])]++
    b.new--
  }
  return out
}

/** Cards coming due on each of the next `days` days (index 0 = today, including overdue). */
export function forecast(s: State, now: Date, days = 7): number[] {
  const out = new Array<number>(days).fill(0)
  for (const id in s.cards) {
    const i = Math.max(0, daysBetween(now, new Date(s.cards[id].due)))
    if (i < days) out[i]++
  }
  return out
}

/**
 * Seconds per answer measured over the last 14 days (03 §5.1); 8 s until 50 answers have been timed.
 * Answers logged before time was recorded do not count.
 */
export function secondsPerAnswer(s: State, now: Date): number {
  let ms = 0
  let c = 0
  for (let i = 0; i < 14; i++) {
    const log = s.log[dayKey(addDays(now, -i))]
    if (log?.ms) {
      ms += log.ms
      c += log.c
    }
  }
  return c >= 50 ? ms / c / 1000 : 8
}

/** Minutes the cards still due today should take: a new word is answered about three times on its first day. */
export function minutesFor(q: Pick<Queue, 'review' | 'learning' | 'fresh'>, secPerAnswer: number): number {
  return Math.max(1, Math.round(((q.review + q.learning + 3 * q.fresh) * secPerAnswer) / 60))
}

/** Share of review cards remembered over the last `days` days; null until there is something to measure. */
export function retention(s: State, now: Date, days = 30): number | null {
  let r = 0
  let p = 0
  for (let i = 0; i < days; i++) {
    const log = s.log[dayKey(addDays(now, -i))]
    if (log) {
      r += log.r
      p += log.p
    }
  }
  return r >= 10 ? p / r : null
}

export function streak(log: State['log'], today = new Date()): number {
  let n = 0
  // today doesn't break the streak until it's over
  let d = log[dayKey(today)]?.c ? today : addDays(today, -1)
  while (log[dayKey(d)]?.c) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** Words that keep being forgotten (Anki calls them leeches), most-forgotten first. */
export function leechIds(cards: State['cards'], limit = 40): string[] {
  return Object.entries(cards)
    .filter(([, c]) => c.lapses >= LEECH_LAPSES)
    .sort((a, b) => b[1].lapses - a[1].lapses)
    .slice(0, limit)
    .map(([id]) => id)
}

// ── game layer ──────────────────────────────────────────────────────────────

// XP is paid per card answered, whatever the answer, so honesty never costs points. Levels were removed
// (03 §6): cumulative XP is shown on the 기록 screen only.
export const XP_PER_CARD = 10

export interface Quest {
  title: string
  have: number
  need: number
  xp: number
  done: boolean
}

/**
 * One quest: finish today's plan (03 §6). Card-count and new-word quests rewarded fast tapping and new words
 * over overdue reviews, so they were dropped.
 */
export function quests(s: State, now: Date): Quest[] {
  const log = s.log[dayKey(now)] ?? emptyLog()
  const q = buildQueue(s, now)
  const cleared = log.c > 0 && !q.next && q.waiting === 0
  return [{ title: '오늘 분량 끝내기', have: cleared ? 1 : 0, need: 1, xp: 50 }].map((x) => ({ ...x, done: x.have >= x.need }))
}

/** Sun..Sat of the current week: whether the user studied that day. */
export function weekDays(log: State['log'], today: Date): { done: boolean; today: boolean; future: boolean }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - today.getDay())
    return { done: !!log[dayKey(d)]?.c, today: i === today.getDay(), future: i > today.getDay() }
  })
}
