// Spaced repetition on top of FSRS (the open scheduler Anki uses): every answer moves a card's
// next review further out when remembered and brings it back within minutes when forgotten.
import { createEmptyCard, fsrs, generatorParameters, Rating, State as CardState, type Card, type Grade } from 'ts-fsrs'
import { COUNTS, fallbackOrder, isReadingCard, LEVELS, levelInfo, levelInfoVersion, levelOf, readingId, readingRetired, wordOfCard, type Level } from './data'
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
  /** today's reviews still to do (at most the day's review quota) */
  review: number
  /** reviews due by tonight but beyond today's quota: kept for the coming days (03 §5.3) */
  held: number
  fresh: number
  /** …of the new words, those introduced with a reading card (fast-track) */
  freshReading: number
  /** the card to show now, if any */
  next: { id: string; kind: Kind } | null
  /** learning cards that come back later today (beyond the learn-ahead window) */
  waiting: number
  /** when the first of the waiting learning cards comes due (null when none wait) */
  nextDue: number | null
}

/**
 * The levels whose words are studied: the target alone, or with `includeLower` the target and every level below
 * it, easiest first (03 §2.1 P4: each level assumes the words of the levels below).
 */
export function studyLevels(settings: Pick<State['settings'], 'target' | 'includeLower'>): Level[] {
  return settings.includeLower ? LEVELS.filter((l) => l >= settings.target) : [settings.target]
}

// ── card types (03 §3 C): meaning card `<id>`, fast-track reading card `<id>:r` ──

/** What the per-word helpers read: the cards and whether the fast-track is on. */
export type CardsView = { cards: State['cards']; settings: Pick<State['settings'], 'fastTrack'> }

const fastOn = (s: { settings: Pick<State['settings'], 'fastTrack'> }) => s.settings?.fastTrack !== false

/**
 * Whether a card takes part in study. Reading cards rest (kept, not shown, not counted) while the fast-track is off,
 * and once the loaded data no longer tags their word S (`readingRetired`): the word then counts as new until its
 * meaning card is introduced, and the reading card comes back as it was if the word is tagged S again.
 */
export const isActive = (id: string, fastTrack: boolean) => !isReadingCard(id) || (fastTrack && !readingRetired(wordOfCard(id)))

/** The active cards of a word (meaning first). */
export function wordCards(s: CardsView, word: string): { id: string; card: SCard }[] {
  const out: { id: string; card: SCard }[] = []
  if (s.cards[word]) out.push({ id: word, card: s.cards[word] })
  const r = readingId(word)
  if (s.cards[r] && isActive(r, fastOn(s))) out.push({ id: r, card: s.cards[r] })
  return out
}

/** A word counts as introduced once it has an active card; words without one are still new. */
export const isSeen = (s: CardsView, word: string) => !!s.cards[word] || (!!s.cards[readingId(word)] && isActive(readingId(word), fastOn(s)))

/**
 * The card that introduces a word: the reading card for a word tagged S while the fast-track is on, else the
 * meaning card. Before the level's data has loaded nothing is known about the word, so it is a meaning card;
 * the study screen waits for the data before showing a new card.
 */
export function introCard(s: { settings: Pick<State['settings'], 'fastTrack'> }, id: string): string {
  const l = levelOf(id)
  return fastOn(s) && l !== undefined && levelInfo(l)?.fast.has(id) ? readingId(id) : id
}

/**
 * The next words to introduce, as card ids: per level in the data's introduction order (frequency, 08 §2),
 * or id order (the data's row order) until the level's data has loaded. Words already introduced are skipped wherever they are in
 * the order, so a learner part-way through a level keeps every word seen and simply gets the next unseen
 * words of the new order.
 */
function nextNewIds(s: State, limit: number): string[] {
  const out: string[] = []
  for (const l of studyLevels(s.settings)) {
    const order = levelInfo(l)?.order ?? fallbackOrder(l)
    for (let k = 0; k < order.length && out.length < limit; k++) if (!isSeen(s, order[k])) out.push(introCard(s, order[k]))
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

/**
 * Today's cards: learning cards due before midnight, and the reviews due before midnight in the order they are
 * shown — oldest due first (ties by card id). Only one card of a word a day: a review whose sibling was answered
 * today, or a second review card of the same word, waits for another day (`buried`; learning cards are mid-step
 * and always come back).
 */
let scanMemo: { cards: State['cards']; ft: boolean; day: string; iv: number; value: ReturnType<typeof scan> } | null = null
function scanToday(s: State, now: Date) {
  const ft = fastOn(s)
  const day = dayKey(now)
  const iv = levelInfoVersion()
  if (scanMemo && scanMemo.cards === s.cards && scanMemo.ft === ft && scanMemo.day === day && scanMemo.iv === iv) return scanMemo.value
  const value = scan(s, now)
  scanMemo = { cards: s.cards, ft, day, iv, value }
  return value
}

function scan(s: State, now: Date) {
  const eod = endOfDay(now)
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const ft = fastOn(s)
  const learning: [string, number][] = []
  let review: [string, number][] = []
  /** words with a card answered today: their other card waits for another day (sibling burying, 03 §3) */
  const answeredToday = new Map<string, string>()
  for (const id in s.cards) {
    if (!isActive(id, ft)) continue
    const c = s.cards[id]
    if ((c.last_review ?? 0) >= sod) answeredToday.set(wordOfCard(id), id)
    if (isLearning(c)) {
      if (c.due < eod) learning.push([id, c.due])
    } else if (c.due < eod) review.push([id, c.due])
  }
  learning.sort((a, b) => a[1] - b[1])
  review.sort(byDue)
  const queued = new Set(learning.map(([id]) => wordOfCard(id)))
  const buried: string[] = []
  review = review.filter(([id]) => {
    const w = wordOfCard(id)
    const other = answeredToday.get(w)
    if ((other !== undefined && other !== id) || queued.has(w)) {
      buried.push(id)
      return false
    }
    queued.add(w)
    return true
  })
  return { learning, review, buried }
}

const byDue = (a: [string, number], b: [string, number]) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

/**
 * `avoid` keeps the card just answered from reappearing immediately when something else is available.
 * `finishNow` shows learning cards that come back later today right away, so a session never has to wait
 * for them (03 §5.2 P7). When more reviews are due than today's review quota (`reviewQuota`), only the
 * oldest-due ones up to the quota are today's; the rest are `held` for the coming days (03 §5.3) and new
 * words are cut to NEW_WHILE_BEHIND.
 */
export function buildQueue(s: State, now: Date, avoid?: string, opts: { finishNow?: boolean } = {}): Queue {
  const t = now.getTime()
  const { learning, review: due } = scanToday(s, now)
  const quota = reviewQuota(s, now)
  const review = due.slice(0, quota.left)
  const held = due.length - review.length
  const fresh = nextNewIds(s, newLeftToday(s, now, s.settings.dailyNew, held > 0))

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
  return {
    learning: learning.length,
    review: review.length,
    held,
    fresh: fresh.length,
    freshReading: fresh.filter(isReadingCard).length,
    next,
    waiting,
    nextDue,
  }
}

// ── backlog (03 §5.3): more reviews due than a day holds are spread over the coming days ──

/** A day's reviews are capped at what fits in this many minutes at the learner's measured pace. */
export const REVIEW_MINUTES = 30
/** …but never fewer than this many reviews (a very slow measured pace must not make the day trivial). */
export const MIN_REVIEW_CAP = 50
/** New words a day while reviews are held for later days (03 §5.1: 밀림이면 새 단어 ≤ 5). */
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
 * The backlog policy as a schedule, for Home's "n일이면 따라잡아요": every review card in due order (the order
 * `buildQueue` shows them; see backlog-sim.ts for why) goes to the first day, from its due day on, that still has
 * room — today's quota left today and the cap on every later day. This is a selection policy derived from the
 * cards: due dates are never rewritten. It counts only the next review of each card; the reviews that follow it
 * and those of new words are assumed to fit in the days.
 */
export function spreadReviews(s: State, now: Date): Spread {
  const todayRoom = reviewQuota(s, now).left
  const args = [s.cards, s.log, s.settings.fastTrack, dayKey(now), todayRoom, levelInfoVersion()]
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

let orderMemo: { cards: State['cards']; ft: boolean; day: string; iv: number; value: number[] } | null = null
/** The day each review card is released (0 = today), in priority order: today's in due order, then later ones by due. */
function spreadOrder(s: State, now: Date): number[] {
  const ft = fastOn(s)
  const day = dayKey(now)
  const iv = levelInfoVersion()
  if (orderMemo && orderMemo.cards === s.cards && orderMemo.ft === ft && orderMemo.day === day && orderMemo.iv === iv) return orderMemo.value
  const value = makeOrder(s, now)
  orderMemo = { cards: s.cards, ft, day, iv, value }
  return value
}

function makeOrder(s: State, now: Date): number[] {
  const eod = endOfDay(now)
  const dayOf = (due: number) => (due < eod ? 0 : 1 + Math.floor((due - eod) / DAY_MS))
  const ft = fastOn(s)
  const { review: dueToday, buried } = scanToday(s, now)
  const buriedSet = new Set(buried)
  const order: number[] = dueToday.map(() => 0)
  const later: [string, number][] = []
  for (const id in s.cards) {
    if (!isActive(id, ft)) continue
    const c = s.cards[id]
    if (!isLearning(c) && (buriedSet.has(id) || c.due >= eod)) later.push([id, c.due])
  }
  later.sort(byDue)
  for (const [, due] of later) order.push(Math.max(1, dayOf(due)))
  return order
}

// ── answering ───────────────────────────────────────────────────────────────

/**
 * How a reading card's multiple-choice answer maps onto FSRS (03 §7.5): the right reading is "알아요" (Good),
 * a wrong one or "모르겠어요" (-1) is Again. There is no Easy: recognising among four choices is easier than
 * recalling, so it never earns the longest interval.
 */
export const gradeReading = (picked: number, answer: number): Grade => (picked === answer ? Rating.Good : Rating.Again)

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

const STAGE_RANK: Record<Stage, number> = { new: 0, learning: 1, young: 2, mature: 3 }

/** A word's stage: the lowest stage among its active cards (03 §3: a word is only as known as its weakest card). */
export function wordStage(s: CardsView, word: string): Stage {
  let st: Stage | null = null
  for (const { card } of wordCards(s, word)) {
    const x = stageOf(card)
    if (st === null || STAGE_RANK[x] < STAGE_RANK[st]) st = x
  }
  return st ?? 'new'
}

/** Words per stage and level. Counted per word, not per card, so a word with two cards counts once. */
export function breakdowns(s: CardsView): Record<Level, Breakdown> {
  const out = Object.fromEntries(
    LEVELS.map((l) => [l, { new: COUNTS[l], learning: 0, young: 0, mature: 0 }]),
  ) as Record<Level, Breakdown>
  const ft = fastOn(s)
  const per = new Map<string, Stage>()
  for (const id in s.cards) {
    if (!isActive(id, ft)) continue
    const w = wordOfCard(id)
    const st = stageOf(s.cards[id])
    const prev = per.get(w)
    if (prev === undefined || STAGE_RANK[st] < STAGE_RANK[prev]) per.set(w, st)
  }
  for (const [w, st] of per) {
    const l = levelOf(w)
    if (l === undefined) continue
    out[l][st]++
    out[l].new--
  }
  return out
}

/**
 * The studied levels' words (`studyLevels`): how many there are, how many were met (introduced) and how many of those
 * are in long-term memory — the sums of the 단어장 level rows (`breakdowns`). Home's word card, the 기록 stamps and the
 * widget show these.
 */
export function studyProgress(s: CardsView & { settings: Pick<State['settings'], 'target' | 'includeLower'> }) {
  const levels = studyLevels(s.settings)
  const b = breakdowns(s)
  let total = 0
  let met = 0
  let mature = 0
  for (const l of levels) {
    total += COUNTS[l]
    met += COUNTS[l] - b[l].new
    mature += b[l].mature
  }
  return { levels, total, met, mature }
}

/** Cards coming due on each of the next `days` days (index 0 = today, including overdue). */
export function forecast(s: State, now: Date, days = 7): number[] {
  const out = new Array<number>(days).fill(0)
  const ft = fastOn(s)
  for (const id in s.cards) {
    if (!isActive(id, ft)) continue
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

/** Times a word was forgotten: the most of its active cards. */
export function wordLapses(s: CardsView, word: string): number {
  return Math.max(0, ...wordCards(s, word).map(({ card }) => card.lapses))
}

/**
 * Words (word ids, never card ids) that keep being forgotten (Anki calls them leeches), most-forgotten first.
 * A word with a forgotten meaning card and reading card is listed once.
 */
export function leechIds(cards: State['cards'], limit = 40, fastTrack = true): string[] {
  const by = new Map<string, number>()
  for (const [id, c] of Object.entries(cards))
    if (c.lapses >= LEECH_LAPSES && isActive(id, fastTrack)) {
      const w = wordOfCard(id)
      by.set(w, Math.max(by.get(w) ?? 0, c.lapses))
    }
  return [...by]
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
