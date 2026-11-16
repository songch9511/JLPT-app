// Spaced repetition on top of FSRS (the open scheduler Anki uses): every answer moves a card's
// next review further out when remembered and brings it back within minutes when forgotten.
import { createEmptyCard, fsrs, generatorParameters, Rating, State as CardState, type Card, type Grade } from 'ts-fsrs'
import { COUNTS, fallbackOrder, LEVELS, levelInfo, levelInfoVersion, levelOf, type Level } from './data'
import { isKanjiId, KANJI_COUNTS, kanjiIdsOfLevel, kanjiLevel } from './kanji'
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
/** A review answered "모르겠어요", being learnt again (it belongs to the review session, `StudyMode`). */
export const isRelearning = (c: SCard | undefined) => c?.state === CardState.Relearning

export function endOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
}

const emptyLog = (): DayLog => ({ c: 0, n: 0, r: 0, p: 0 })

// ── today's queue ───────────────────────────────────────────────────────────

export type Kind = 'new' | 'learning' | 'review'
/**
 * Which of today's cards a study session shows. Home has three sessions: `review` (word reviews due today, and words
 * being relearned after a forgotten review), `new` (today's new words, and words still in their first learning steps)
 * and `kanji` (the kanji cards: reviews, learning steps and today's new kanji). `all` is the day's words in one queue
 * (`review` and `new` together): the plain `#/study` route (the reminder notification, the widget). The whole day is
 * `all` and `kanji` (`dayLeft`).
 *
 * A word's learning card belongs to the session that put it into learning, read from its FSRS state (nothing is saved
 * for it): `Learning` is a word introduced as new, `Relearning` a review answered "모르겠어요". So the sessions split
 * today's cards exactly — every card of `all` is in one of them, none in two.
 */
export type StudyMode = 'all' | 'review' | 'new' | 'kanji'
export interface Queue {
  learning: number
  /** today's reviews still to do (word reviews: at most the day's review quota) */
  review: number
  /** word reviews due by tonight but beyond today's quota: kept for the coming days (03 §5.3) */
  held: number
  fresh: number
  /** the card to show now, if any */
  next: { id: string; kind: Kind } | null
  /** learning cards that come back later today (beyond the learn-ahead window) */
  waiting: number
  /** when the first of the waiting learning cards comes due (null when none wait) */
  nextDue: number | null
}

/**
 * The levels whose words are studied: the target alone, or with `includeLower` the target and every level below
 * it, easiest first (03 §2.1 P4: each level assumes the words of the levels below). Their kanji are studied too.
 */
export function studyLevels(settings: Pick<State['settings'], 'target' | 'includeLower'>): Level[] {
  return settings.includeLower ? LEVELS.filter((l) => l >= settings.target) : [settings.target]
}

/** What the per-word helpers read. */
export type CardsView = { cards: State['cards'] }

/** A word or kanji counts as introduced once it has a card. */
export const isSeen = (s: CardsView, id: string) => !!s.cards[id]

/**
 * The next words to introduce: per level in the data's introduction order (frequency, 08 §2), or id order until the
 * level's data has loaded. Words already introduced are skipped wherever they are in the order, so a learner part-way
 * through a level keeps every word seen and simply gets the next unseen words of the new order.
 */
function nextNewIds(s: State, limit: number): string[] {
  const out: string[] = []
  for (const l of studyLevels(s.settings)) {
    const order = levelInfo(l)?.order ?? fallbackOrder(l)
    for (let k = 0; k < order.length && out.length < limit; k++) if (!s.cards[order[k]]) out.push(order[k])
  }
  return out
}

/** The next kanji to introduce: the studied levels' kanji, easiest level first, in their introduction order. */
function nextNewKanji(s: State, limit: number): string[] {
  const out: string[] = []
  for (const l of studyLevels(s.settings)) {
    const ids = kanjiIdsOfLevel(l)
    for (let k = 0; k < ids.length && out.length < limit; k++) if (!s.cards[ids[k]]) out.push(ids[k])
  }
  return out
}

/** Words not yet introduced in the levels being studied. */
export function newWordsLeft(s: State): number {
  const b = breakdowns(s)
  return studyLevels(s.settings).reduce((n, l) => n + b[l].new, 0)
}

/**
 * New words still allowed today: the daily setting (never above MAX_DAILY_NEW; at most NEW_WHILE_BEHIND while
 * reviews are `behind`, i.e. held for later days) plus extras unlocked today.
 */
export function newLeftToday(s: State, now: Date, dailyNew = s.settings.dailyNew, behind = false): number {
  const log = s.log[dayKey(now)]
  return Math.max(0, newPerDay(dailyNew, behind) + (log?.x ?? 0) - (log?.n ?? 0))
}

/** The plan's new words for a day: the setting, held to MAX_DAILY_NEW, and to NEW_WHILE_BEHIND while catching up. */
export const newPerDay = (dailyNew: number, behind: boolean) => Math.min(MAX_DAILY_NEW, dailyNew, behind ? NEW_WHILE_BEHIND : Infinity)

/** New kanji still allowed today: 하루 새 한자, at most NEW_WHILE_BEHIND while word reviews are held for later days. */
export function newKanjiLeftToday(s: State, now: Date, behind = false): number {
  const log = s.log[dayKey(now)]
  return Math.max(0, Math.min(s.settings.dailyKanji ?? 5, behind ? NEW_WHILE_BEHIND : Infinity) - (log?.kn ?? 0))
}

/**
 * Today's cards: learning cards due before midnight, and the reviews due before midnight in the order they are shown —
 * oldest due first (ties by card id) — words and kanji apart.
 */
let scanMemo: { cards: State['cards']; day: string; value: ReturnType<typeof scan> } | null = null
function scanToday(s: State, now: Date) {
  const day = dayKey(now)
  if (scanMemo && scanMemo.cards === s.cards && scanMemo.day === day) return scanMemo.value
  const value = scan(s, now)
  scanMemo = { cards: s.cards, day, value }
  return value
}

function scan(s: State, now: Date) {
  const eod = endOfDay(now)
  const learning: [string, number][] = []
  const review: [string, number][] = []
  const kLearning: [string, number][] = []
  const kReview: [string, number][] = []
  for (const id in s.cards) {
    const c = s.cards[id]
    if (c.due >= eod) continue
    const k = isKanjiId(id)
    if (isLearning(c)) (k ? kLearning : learning).push([id, c.due])
    else (k ? kReview : review).push([id, c.due])
  }
  learning.sort((a, b) => a[1] - b[1])
  kLearning.sort((a, b) => a[1] - b[1])
  review.sort(byDue)
  kReview.sort(byDue)
  return { learning, review, kLearning, kReview }
}

const byDue = (a: [string, number], b: [string, number]) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

/**
 * `avoid` keeps the card just answered from reappearing immediately when something else is available.
 * `finishNow` shows learning cards that come back later today right away, so a session never has to wait
 * for them (03 §5.2 P7). When more word reviews are due than today's review quota (`reviewQuota`), only the
 * oldest-due ones up to the quota are today's; the rest are `held` for the coming days (03 §5.3) and new
 * words and new kanji are cut to NEW_WHILE_BEHIND. `mode` keeps one session's cards (`StudyMode`): the day is planned
 * as a whole first (the quota, `held`, the cut of new words), then the other sessions' cards are left out, so the
 * sessions' counts always add up to the day's.
 */
export function buildQueue(s: State, now: Date, avoid?: string, opts: { finishNow?: boolean; mode?: StudyMode } = {}): Queue {
  const t = now.getTime()
  const mode = opts.mode ?? 'all'
  const today = scanToday(s, now)
  const quota = reviewQuota(s, now)
  const held = Math.max(0, today.review.length - quota.left)
  const kanji = mode === 'kanji'
  const learning = kanji ? today.kLearning : mode === 'all' ? today.learning : today.learning.filter(([id]) => (s.cards[id].state === CardState.Relearning) === (mode === 'review'))
  const review = kanji ? today.kReview : mode === 'new' ? [] : today.review.slice(0, quota.left)
  const fresh = kanji ? nextNewKanji(s, newKanjiLeftToday(s, now, held > 0)) : mode === 'review' ? [] : nextNewIds(s, newLeftToday(s, now, s.settings.dailyNew, held > 0))

  const ready = opts.finishNow ? learning : learning.filter(([, due]) => due <= t + LEARN_AHEAD_MS)
  const dueNow = ready.filter(([, due]) => due <= t)
  const answered = s.log[dayKey(now)]?.c ?? 0
  // New cards are sprinkled between reviews (every 4th card) instead of piling up at the end.
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
  return { learning: learning.length, review: review.length, held, fresh: fresh.length, next, waiting, nextDue }
}

/** Cards still to do today, words and kanji: what Home's "오늘" counts and when the day is done. */
export function dayLeft(s: State, now: Date): { left: number; waiting: number; next: boolean } {
  const w = buildQueue(s, now)
  const k = buildQueue(s, now, undefined, { mode: 'kanji' })
  return { left: cardsLeft(w) + cardsLeft(k), waiting: w.waiting + k.waiting, next: !!(w.next || k.next) }
}

/** Word reviews due by tonight, all of them (Home's "412장 중 100장" while some are held for later days). */
export const reviewsDue = (s: State, now: Date) => scanToday(s, now).review.length

// ── backlog (03 §5.3): more reviews due than a day holds are spread over the coming days ──

/** A day's reviews are capped at what fits in this many minutes at the learner's measured pace. */
export const REVIEW_MINUTES = 30
/** …but never fewer than this many reviews (a very slow measured pace must not make the day trivial). */
export const MIN_REVIEW_CAP = 50
/** New words a day while reviews are held for later days (03 §5.1: 밀림이면 새 단어 ≤ 5); new kanji too. */
export const NEW_WHILE_BEHIND = 5
/** Reviews added by one "더 하기". */
export const MORE_REVIEWS = 50

/**
 * Reviews a day can hold: REVIEW_MINUTES at the seconds per answer measured before today (so it does not move
 * while the learner studies), at least MIN_REVIEW_CAP. 225 at the default 8 s.
 */
export function reviewCap(s: State, now: Date): number {
  return Math.max(MIN_REVIEW_CAP, Math.floor((REVIEW_MINUTES * 60) / secondsPerAnswer(s, addDays(now, -1))))
}

/** Today's review quota: the cap plus reviews unlocked with "더 하기", minus review answers already given today. */
export function reviewQuota(s: State, now: Date) {
  const log = s.log[dayKey(now)]
  const cap = reviewCap(s, now)
  const extra = log?.xr ?? 0
  const done = log?.r ?? 0
  return { cap, extra, done, left: Math.max(0, cap + extra - done) }
}

/** Let `n` more reviews into today's quota ("더 하기"). */
export function unlockMoreReviews(n: number, now = new Date()) {
  update((d) => {
    const key = dayKey(now)
    const log = { ...(d.log[key] ?? emptyLog()) }
    log.xr = (log.xr ?? 0) + n
    d.log = { ...d.log, [key]: log }
  })
}

export interface Spread {
  /** reviews already due and still waiting at the end of each day (index 0 = today) */
  held: number[]
  /** days, today included, until nothing due waits any more; 0 when nothing is held today */
  catchUp: number
}

const DAY_MS = 86_400_000
let spreadMemo: { args: unknown[]; value: Spread } | null = null

/**
 * The backlog policy as a schedule, for "n일이면 따라잡아요": every word review card in due order (the order
 * `buildQueue` shows them; see backlog-sim.ts for why) goes to the first day, from its due day on, that still has
 * room — today's quota left today and the cap on every later day. This is a selection policy derived from the
 * cards: due dates are never rewritten. It counts only the next review of each card; the reviews that follow it
 * and those of new words are assumed to fit in the days.
 */
export function spreadReviews(s: State, now: Date): Spread {
  const todayRoom = reviewQuota(s, now).left
  const args = [s.cards, s.log, dayKey(now), todayRoom, levelInfoVersion()]
  if (spreadMemo && spreadMemo.args.every((a, i) => a === args[i])) return spreadMemo.value
  const cap = reviewCap(s, now)
  // first day >= release with room, via "next free day" links (days fill up in order)
  const room: number[] = []
  const nextFree: number[] = []
  const roomOf = (d: number) => (room[d] ??= d === 0 ? todayRoom : cap)
  const find = (d: number): number => {
    let x = d
    while (nextFree[x] !== undefined) x = nextFree[x]
    // path compression
    while (d !== x) {
      const n = nextFree[d]
      nextFree[d] = x
      d = n
    }
    return x
  }
  const released: number[] = []
  const assigned: number[] = []
  for (const rel of spreadOrder(s, now)) {
    let d = find(rel)
    while (roomOf(d) === 0) {
      nextFree[d] = d + 1
      d = find(d + 1)
    }
    room[d]--
    released[rel] = (released[rel] ?? 0) + 1
    assigned[d] = (assigned[d] ?? 0) + 1
  }
  const held: number[] = []
  let waiting = 0
  let catchUp = 0
  for (let d = 0; d < Math.max(released.length, assigned.length); d++) {
    waiting += (released[d] ?? 0) - (assigned[d] ?? 0)
    held.push(waiting)
    // the backlog of today: cleared on the first day that ends with nothing waiting
    if (held[0] > 0 && catchUp === 0 && waiting === 0) catchUp = d + 1
  }
  const value = { held, catchUp }
  spreadMemo = { args, value }
  return value
}

let orderMemo: { cards: State['cards']; day: string; value: number[] } | null = null
/** The day each word review card is released (0 = today), in priority order: today's in due order, then later ones by due. */
function spreadOrder(s: State, now: Date): number[] {
  const day = dayKey(now)
  if (orderMemo && orderMemo.cards === s.cards && orderMemo.day === day) return orderMemo.value
  const value = makeOrder(s, now)
  orderMemo = { cards: s.cards, day, value }
  return value
}

function makeOrder(s: State, now: Date): number[] {
  const eod = endOfDay(now)
  const dayOf = (due: number) => (due < eod ? 0 : 1 + Math.floor((due - eod) / DAY_MS))
  const { review: dueToday } = scanToday(s, now)
  const order: number[] = dueToday.map(() => 0)
  const later: [string, number][] = []
  for (const id in s.cards) {
    if (isKanjiId(id)) continue
    const c = s.cards[id]
    if (!isLearning(c) && c.due >= eod) later.push([id, c.due])
  }
  later.sort(byDue)
  for (const [, due] of later) order.push(Math.max(1, dayOf(due)))
  return order
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
    gained = applyAnswer(d, id, grade, now, activeMs)
  })
  return gained
}

/**
 * One answer applied to a state being updated (a draft of `update`, which this replaces the nested objects of): the
 * card's next schedule, the day's log, XP and the quest. Deterministic: the same card, grade, time and active time
 * always give the same result (FSRS's fuzz is seeded by the review time and the card), which is what lets the study
 * session's history (src/session.ts) take answers back and give them again with another grade.
 */
export function applyAnswer(d: State, id: string, grade: Grade, now: Date, activeMs?: number): number {
  const prev = d.cards[id]
  const at = reviewTime(prev, now)
  const card = prev ? toCard(prev) : createEmptyCard(now)
  const { card: next } = scheduler.next(card, at, grade)
  d.cards = { ...d.cards, [id]: fromCard(next) }
  const key = dayKey(now)
  if (!prev && !d.first?.[id]) d.first = { ...d.first, [id]: key }
  const log = { ...(d.log[key] ?? emptyLog()) }
  log.c++
  // a kanji card has its own counts, so the word plan (new words, the review quota) never moves with it
  if (isKanjiId(id)) {
    if (!prev) log.kn = (log.kn ?? 0) + 1
    if (prev?.state === CardState.Review) {
      log.kr = (log.kr ?? 0) + 1
      if (grade !== Rating.Again) log.kp = (log.kp ?? 0) + 1
    }
  } else {
    if (!prev) log.n++
    if (prev?.state === CardState.Review) {
      log.r++
      if (grade !== Rating.Again) log.p++
    }
  }
  if (activeMs !== undefined && Number.isFinite(activeMs) && activeMs > 0) log.ms = (log.ms ?? 0) + Math.min(MAX_CARD_MS, Math.round(activeMs))
  d.log = { ...d.log, [key]: log }

  let gained = XP_PER_CARD
  quests(d, now).forEach((q, i) => {
    if (q.done && !((log.q ?? 0) & (1 << i))) {
      log.q = (log.q ?? 0) | (1 << i)
      gained += q.xp
    }
  })
  log.xp = (log.xp ?? 0) + gained
  d.xp += gained
  return gained
}

/** The intervals `previewIntervals` shows, for a card as it was (`prev`, undefined when new) at an earlier time. */
export function previewFrom(prev: SCard | undefined, at: Date): Record<Grade, string> {
  const rec = scheduler.repeat(prev ? toCard(prev) : createEmptyCard(at), reviewTime(prev, at))
  const fmt = (g: Grade) => formatInterval(rec[g].card.due.getTime() - at.getTime())
  return { [Rating.Again]: fmt(Rating.Again), [Rating.Hard]: fmt(Rating.Hard), [Rating.Good]: fmt(Rating.Good), [Rating.Easy]: fmt(Rating.Easy) } as Record<Grade, string>
}

export type Snapshot = Pick<State, 'cards' | 'log' | 'xp'>
export const snapshot = (): Snapshot => ({ cards: getState().cards, log: getState().log, xp: getState().xp })
export function restore(s: Snapshot) {
  update((d) => {
    d.cards = s.cards
    // "더 하기" (x, xr) unlocked since the snapshot is not part of the answer being undone: it stays. (Undoing the
    // last card of the day after "복습 50장 더 하기" on the done screen took the 50 back.)
    const log = { ...s.log }
    for (const [day, cur] of Object.entries(d.log)) {
      if (cur.x === undefined && cur.xr === undefined) continue
      const was: DayLog = { ...(log[day] ?? emptyLog()) }
      if (cur.x !== undefined) was.x = cur.x
      if (cur.xr !== undefined) was.xr = cur.xr
      log[day] = was
    }
    d.log = log
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


/** A word's (or a kanji's) stage. */
export const wordStage = (s: CardsView, id: string): Stage => stageOf(s.cards[id])

/** Words per stage and level. */
export function breakdowns(s: CardsView): Record<Level, Breakdown> {
  const out = Object.fromEntries(LEVELS.map((l) => [l, { new: COUNTS[l], learning: 0, young: 0, mature: 0 }])) as Record<Level, Breakdown>
  for (const id in s.cards) {
    const l = levelOf(id)
    if (l === undefined) continue
    out[l][stageOf(s.cards[id])]++
    out[l].new--
  }
  return out
}

/** Kanji per stage and level. */
export function kanjiBreakdowns(s: CardsView): Record<Level, Breakdown> {
  const out = Object.fromEntries(LEVELS.map((l) => [l, { new: KANJI_COUNTS[l], learning: 0, young: 0, mature: 0 }])) as Record<Level, Breakdown>
  for (const id in s.cards) {
    const l = kanjiLevel(id)
    if (l === undefined) continue
    out[l][stageOf(s.cards[id])]++
    out[l].new--
  }
  return out
}

/**
 * The studied levels' words and kanji (`studyLevels`): how many there are, how many were met (introduced) and how many
 * words are in long-term memory — the sums of the 단어장 level rows (`breakdowns`). 기록 and the widget show these.
 */
export function studyProgress(s: CardsView & { settings: Pick<State['settings'], 'target' | 'includeLower'> }) {
  const levels = studyLevels(s.settings)
  const b = breakdowns(s)
  const kb = kanjiBreakdowns(s)
  let total = 0
  let met = 0
  let mature = 0
  let kanjiTotal = 0
  let kanjiMet = 0
  for (const l of levels) {
    total += COUNTS[l]
    met += COUNTS[l] - b[l].new
    mature += b[l].mature
    kanjiTotal += KANJI_COUNTS[l]
    kanjiMet += KANJI_COUNTS[l] - kb[l].new
  }
  return { levels, total, met, mature, kanjiTotal, kanjiMet }
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
 * Seconds per answer measured over the 14 days ending `now` (03 §5.1); 8 s until 50 answers have been timed.
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

/** The cards a queue still holds: the number on Home's button for a session and the study screen's "남음". */
export const cardsLeft = (q: Pick<Queue, 'review' | 'learning' | 'fresh'>) => q.review + q.learning + q.fresh

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
      r += log.r + (log.kr ?? 0)
      p += log.p + (log.kp ?? 0)
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

/** Times a word (or a kanji) was forgotten. */
export const wordLapses = (s: CardsView, id: string): number => s.cards[id]?.lapses ?? 0

/**
 * Words (or, with `kanji`, kanji) that keep being forgotten (Anki calls them leeches), most-forgotten first.
 */
export function leechIds(cards: State['cards'], limit = 40, kanji = false): string[] {
  const by: [string, number][] = []
  for (const [id, c] of Object.entries(cards)) if (c.lapses >= LEECH_LAPSES && isKanjiId(id) === kanji) by.push([id, c.lapses])
  return by
    .sort((a, b) => b[1] - a[1])
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
  const d = dayLeft(s, now)
  const cleared = log.c > 0 && !d.next && d.waiting === 0
  return [{ title: '오늘 분량 끝내기', have: cleared ? 1 : 0, need: 1, xp: 50 }].map((x) => ({ ...x, done: x.have >= x.need }))
}
