import { useSyncExternalStore } from 'react'
import { LEVELS, type Level } from './data'
import { fromLegacy, isWordId, LEGACY_ID, WORD_ID } from './ids'
import { upcomingExams } from './util'

/** A scheduled card (ts-fsrs Card with timestamps as epoch ms). Words without an entry are still new. */
export interface SCard {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** 1 learning · 2 review · 3 relearning */
  state: number
  last_review?: number
}

export interface DayLog {
  /** answers given */
  c: number
  /** new words introduced */
  n: number
  /** answers on cards that were in review (the ones that measure retention) */
  r: number
  /** …of which remembered */
  p: number
  /** extra new words unlocked for this day on top of the daily limit */
  x?: number
  /** extra reviews let into this day's quota with "더 하기" while reviews are held for later days (03 §5.3) */
  xr?: number
  /** XP earned this day */
  xp?: number
  /** quests already rewarded this day (bitmask by quest index) */
  q?: number
  /** active study time in ms: from a card appearing to its answer, at most 60 s per card (03 §5.1) */
  ms?: number
  /** sum of the predicted recall of the review answers counted in `r`, to compare with `p` (03 §4.1) */
  e?: number
}

export interface State {
  /**
   * 4 since stable word ids (docs/plan/08 §7: `w0k3`, `w0k3:r`); 3 since the cognate fast-track (reading cards
   * `<id>:r`, `settings.fastTrack`); 2 before. v2 and v3 used positional ids (`3-17`) and are migrated on load.
   */
  v: 4
  onboarded: boolean
  settings: {
    target: Level
    examDate: string
    dailyNew: number
    theme: 'system' | 'light' | 'dark'
    autoSpeak: boolean
    /** also study (and count towards readiness) the levels below the target, e.g. N5·N4 for an N3 learner */
    includeLower: boolean
    /** share of the readiness word set the learner aims to remember on the exam day (0.7 · 0.8 · 0.9) */
    goal: number
    /**
     * Cognate fast-track (02 F3, 03 §2.4): words that mean the same as their Korean hanja word (k = S) are
     * learned with a reading card (`<id>:r`) instead of a meaning card. Off: every word uses a meaning card
     * and reading cards made so far rest (kept, not shown, not counted).
     */
    fastTrack: boolean
  }
  /** keys: stable word id (`w0k3`, src/ids.ts) meaning card, `w0k3:r` reading card; only ids this version knows (see `orphans`) */
  cards: Record<string, SCard>
  log: Record<string, DayLog>
  marks: string[]
  xp: number
  /** highest expected recall reached so far: journey stamps once earned stay (03 §6) */
  bestE?: number
  /**
   * Save counter, +1 on every change (added for the iOS app, docs/plan/10). The app keeps a second copy of the
   * state outside the web view's storage and, at launch, keeps whichever copy has the higher count; a counter
   * rather than a clock, so a device clock that moved does not decide which copy is newer. Absent in states
   * saved before it existed (read as 0). Not exported in backups.
   */
  rev?: number
  /**
   * Quarantine: records whose word this version does not know — a positional id that never named a word, or a
   * stable id from a newer word list or of a retired word — kept exactly as found (id and card untouched), never
   * shown or counted, carried in backups. Moved back into `cards`/`marks` as soon as a version knows the word.
   */
  orphans?: { cards: Record<string, SCard>; marks: string[] }
  /**
   * Device-only (not exported, like `rev`): fingerprint of the text under LEGACY_KEY that this state already
   * contains — the copy migrated from, or a later write by a tab still running the version before stable ids that
   * was merged in. A different text there means such a tab saved again (see `mergeLegacy`).
   */
  legacy?: { h: string }
}

// storage keys keep the app's former name (Kasane) so existing learners keep their records
/** New words a day never go above this, whatever the setting or an older saved value says (03 §5.1). */
export const MAX_DAILY_NEW = 40
export const GOALS = [0.7, 0.8, 0.9] as const

/**
 * Stable-id states (v4) live under their own key. A tab still running the version before stable ids reads and
 * writes only LEGACY_KEY and never sees this one, so it cannot load ids it does not understand or overwrite
 * migrated records (docs/plan/08 §7.4).
 */
const KEY = 'kasane.state.v4'
export const STATE_KEY = KEY
/**
 * Where the versions before stable ids kept their state (v2/v3, positional ids; the name predates v3). Read once
 * and migrated; never written by this version, so it stays the pre-migration copy (recoverable, docs/plan/08
 * §7.5). Cleared only by "모든 기록 초기화".
 */
export const LEGACY_KEY = 'kasane.state.v2'
/** The state as it was just before the last import, so the import can be undone. */
export const PREV_KEY = 'kasane.state.prev'

export const STATE_VERSION = 4

function initial(): State {
  return {
    v: STATE_VERSION,
    onboarded: false,
    // new learners include the lower levels; states saved before this setting existed keep it off (normalize)
    settings: { target: 5, examDate: upcomingExams()[0], dailyNew: 20, theme: 'system', autoSpeak: false, includeLower: true, goal: 0.8, fastTrack: true },
    cards: {},
    log: {},
    marks: [],
    xp: 0,
  }
}

/** A state as saved by this or an earlier version: `v: 2` before the fast-track, `v: 3` before stable ids. */
export type StoredState = Omit<State, 'v' | 'settings'> & { v: 2 | 3 | 4; settings: Partial<State['settings']> & { target: Level } }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
/**
 * A card the scheduler and the readiness model can read: every FSRS number there, a known state, and a last review
 * for any card already studied (ts-fsrs throws on a studied card without one, and that happened while rendering
 * Home: an imported file with such a card opened the recovery screen on every launch). Every card this app has saved
 * since it moved to FSRS has all of these.
 */
const CARD_NUMS = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses'] as const
const isCard = (c: unknown): c is SCard =>
  isObj(c) &&
  CARD_NUMS.every((k) => isNum(c[k])) &&
  (c.state === 0 || c.state === 1 || c.state === 2 || c.state === 3) &&
  (c.state === 0 ? c.last_review === undefined || isNum(c.last_review) : isNum(c.last_review))
const lastReview = (c: SCard) => (isNum(c.last_review) ? (c.last_review as number) : 0)
/** Of two cards of the same id, whether `a` holds the later learning (later last review, then more reviews). */
const later = (a: SCard, b: SCard) => lastReview(a) > lastReview(b) || (lastReview(a) === lastReview(b) && (a.reps ?? 0) > (b.reps ?? 0))

/** The id a stored card or bookmark id has in this version, or undefined when this version does not know it. */
function currentId(id: string): string | undefined {
  // stable ids start with `w`; anything else is checked as a positional id (or is unknown)
  if (id.charCodeAt(0) !== 119) return LEGACY_ID.test(id) ? fromLegacy(id) : undefined
  const i = id.indexOf(':')
  const word = i < 0 ? id : id.slice(0, i)
  const suffix = i < 0 ? '' : id.slice(i)
  return isWordId(word) && (suffix === '' || suffix === ':r') ? id : undefined
}

/**
 * Word ids of a stored state, made current (docs/plan/08 §7.3). Positional ids (v2/v3) become stable ids through
 * the frozen table of src/generated/word-ids.ts; stable ids stay. A record whose id is not known here goes to
 * `orphans` unchanged; a quarantined record whose word is known again comes back. The card objects themselves are
 * passed through untouched (FSRS fields byte for byte) and cards keep their order. Applying it again changes
 * nothing, so it is safe on every load, import and merge.
 */
export function migrateIds(s: Pick<StoredState, 'cards' | 'marks' | 'orphans'>): { cards: Record<string, SCard>; marks: string[]; orphans?: State['orphans'] } {
  // every launch of a migrated state: nothing to translate, nothing quarantined — keep the objects as they are
  if (isObj(s.cards) && Array.isArray(s.marks) && !s.orphans) {
    let same = true
    for (const id in s.cards) if (currentId(id) !== id) { same = false; break }
    if (same && s.marks.every((m) => typeof m === 'string' && currentId(m) === m && !m.includes(':') && s.marks.indexOf(m) === s.marks.lastIndexOf(m)))
      return { cards: s.cards, marks: s.marks }
  }
  const cards: Record<string, SCard> = {}
  const orphanCards: Record<string, SCard> = {}
  const keepOrphan = (id: string, c: SCard) => {
    // two quarantined records under one id cannot happen from a single state; keep the later learning if they do
    if (!orphanCards[id] || later(c, orphanCards[id])) orphanCards[id] = c
  }
  /** the id each kept card was stored under, to quarantine a displaced one under its own id */
  const origin: Record<string, string> = {}
  const take = (id: string, c: SCard) => {
    const to = currentId(id)
    if (to === undefined) return keepOrphan(id, c)
    const have = cards[to]
    if (!have) {
      cards[to] = c
      origin[to] = id
    }
    // the same word twice (a positional and a stable id of it in one state): the later learning wins, the other is kept apart
    else if (later(c, have)) {
      keepOrphan(origin[to], have)
      cards[to] = c
      origin[to] = id
    } else keepOrphan(id, c)
  }
  for (const [id, c] of Object.entries(s.cards ?? {})) take(id, c)
  for (const [id, c] of Object.entries(s.orphans?.cards ?? {})) take(id, c)
  const marks: string[] = []
  const orphanMarks: string[] = []
  for (const id of [...(Array.isArray(s.marks) ? s.marks : []), ...(s.orphans?.marks ?? [])]) {
    if (typeof id !== 'string') continue
    const to = currentId(id)
    if (to !== undefined && !to.includes(':')) {
      if (!marks.includes(to)) marks.push(to)
    } else if (!orphanMarks.includes(id)) orphanMarks.push(id)
  }
  const orphans = Object.keys(orphanCards).length || orphanMarks.length ? { cards: orphanCards, marks: orphanMarks } : undefined
  return { cards, marks, orphans }
}

/** How many records are kept apart because this version does not know their words (shown only when not zero). */
export const orphanCount = (s: Pick<State, 'orphans'>) => Object.keys(s.orphans?.cards ?? {}).length + (s.orphans?.marks?.length ?? 0)

/**
 * A saved or imported state, completed with defaults for fields added since it was written, at the current
 * version. v3 → v4 (stable ids): card and bookmark ids are translated (`migrateIds`), nothing else changes.
 * v2 → v3 (the fast-track): `fastTrack` defaults to on; cards keep their content, so words already learned with a
 * meaning card keep it and only words introduced from now on can get a reading card.
 * Within v2 fields were only added: a missing `includeLower` means a learner from before the setting (kept off
 * so their plan does not suddenly grow); `dailyNew` is held to MAX_DAILY_NEW; the API key of the removed AI
 * feature is dropped.
 */
export function migrate(s: StoredState): State {
  const { cards, marks, orphans } = migrateIds(s)
  const { orphans: _o, ...rest } = s
  return normalize({ ...rest, cards, marks, ...(orphans ? { orphans } : {}), v: STATE_VERSION } as State)
}

/** How far ahead an exam date may be: the readiness projection's work grows with the days left (03 §4.3). */
export const MAX_EXAM_DAYS = 3 * 366

/**
 * Whether `d` is an exam date the app can plan for: a calendar day (yyyy-mm-dd) no more than MAX_EXAM_DAYS ahead. A
 * date in the past is fine (Home asks for the next one). A far date — a mistyped year in the date field, or a file —
 * made the projection run for many seconds on every Home render (a year 9999 ran out of memory), and a date that is
 * not a text crashed it.
 */
export function examDateOk(d: unknown, now = new Date()): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(y, m - 1, day)
  if (Number.isNaN(t.getTime())) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((t.getTime() - today.getTime()) / 86_400_000) <= MAX_EXAM_DAYS
}

function normalize(s: State): State {
  const base = initial()
  const { apiKey: _apiKey, ...settings } = { ...base.settings, ...s.settings } as State['settings'] & { apiKey?: unknown }
  if (s.settings.includeLower === undefined) settings.includeLower = false
  const daily = Number(settings.dailyNew)
  settings.dailyNew = Number.isFinite(daily) ? Math.min(MAX_DAILY_NEW, Math.max(0, Math.round(daily))) : base.settings.dailyNew
  if (!GOALS.includes(settings.goal as (typeof GOALS)[number])) settings.goal = base.settings.goal
  settings.includeLower = settings.includeLower === true
  settings.fastTrack = settings.fastTrack !== false
  if (!examDateOk(settings.examDate)) settings.examDate = base.settings.examDate
  return { ...base, ...s, v: STATE_VERSION, settings }
}

/** A cheap fingerprint of a stored text (length + FNV-1a), to tell whether LEGACY_KEY changed since it was read. */
export function fingerprint(raw: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619)
  return `${raw.length}:${(h >>> 0).toString(36)}`
}

/** Parsed text if it has the shape of a state (the same check `load` always made), else null. */
function parseStored(raw: string | null): StoredState | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return isObj(s) && isObj(s.settings) ? (s as unknown as StoredState) : null
  } catch {
    return null
  }
}

/**
 * Records saved by a tab still running the version before stable ids, merged into the current state: every card
 * the other copy has learned more recently (later last review, then more reviews) is taken, new cards and
 * bookmarks are added, a day's log takes the larger count of each field, XP and the best expected recall the
 * larger value. Nothing the current state has is removed or rolled back, and merging the same text twice changes
 * nothing. Settings stay as they are here. (A tab of the old version cannot be told about this version's saves —
 * it never reads STATE_KEY — so the two are reconciled card by card instead of by replacing the whole state.)
 */
export function mergeStates(cur: State, other: State): State {
  const cards = { ...cur.cards }
  // only well-formed cards come in from the other copy: a damaged record there must not break this one
  for (const [id, c] of Object.entries(other.cards)) if (isCard(c) && (!isCard(cards[id]) || later(c, cards[id]))) cards[id] = c
  const log = { ...cur.log }
  for (const [day, o] of Object.entries(isObj(other.log) ? other.log : {})) {
    if (!isObj(o)) continue
    const c = log[day]
    if (!isObj(c)) {
      log[day] = o
      continue
    }
    const m: DayLog = { ...c }
    for (const k of Object.keys(o) as (keyof DayLog)[]) {
      const b = o[k]
      if (!isNum(b)) continue
      const a = isNum(c[k]) ? (c[k] as number) : 0
      m[k] = k === 'q' ? a | (b as number) : Math.max(a, b as number)
    }
    log[day] = m
  }
  const marks = [...cur.marks, ...other.marks.filter((m) => typeof m === 'string' && !cur.marks.includes(m))]
  const orphanCards = { ...(cur.orphans?.cards ?? {}) }
  for (const [id, c] of Object.entries(other.orphans?.cards ?? {})) if (isCard(c) && (!isCard(orphanCards[id]) || later(c, orphanCards[id]))) orphanCards[id] = c
  const orphanMarks = [...(cur.orphans?.marks ?? []), ...(other.orphans?.marks ?? []).filter((m) => !cur.orphans?.marks.includes(m))]
  const out: State = {
    ...cur,
    onboarded: cur.onboarded || other.onboarded,
    cards,
    log,
    marks,
    xp: Math.max(cur.xp, isNum(other.xp) ? other.xp : 0),
    rev: Math.max(cur.rev ?? 0, other.rev ?? 0),
  }
  const bestE = Math.max(cur.bestE ?? 0, other.bestE ?? 0)
  if (bestE > 0) out.bestE = bestE
  if (Object.keys(orphanCards).length || orphanMarks.length) out.orphans = { cards: orphanCards, marks: orphanMarks }
  return out
}

/**
 * `s` with whatever a tab of the version before stable ids saved under LEGACY_KEY since `s` last looked, merged
 * in (same object when nothing changed). The legacy text is translated by the same `migrate` as every load.
 */
function withLegacy(s: State): State {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return s
  }
  if (!raw) return s
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  const h = fingerprint(raw)
  try {
    performance.measure('kasane.legacy-check', { start: t0 })
  } catch {
    /* no User Timing */
  }
  if (s.legacy?.h === h) return s
  const old = parseStored(raw)
  if (!old) return s
  return { ...mergeStates(s, migrate(old)), legacy: { h } }
}

/** Set when a saved state could not be migrated: the app shows the recovery screen and saves nothing (see `load`). */
let loadError: Error | null = null
export const getLoadError = () => loadError

/**
 * The state to start from, and whether it must be written back now (it was migrated or merged).
 * - STATE_KEY holds a v4 state: that, plus any newer save of an old-version tab under LEGACY_KEY (`withLegacy`).
 * - Only LEGACY_KEY (v2/v3), or a damaged STATE_KEY next to it: migrated to v4. LEGACY_KEY itself is left exactly as it is: it is the copy to recover
 *   from, and a failure anywhere before the v4 state is stored leaves everything as it was, to be tried again at
 *   the next launch. Caches keyed by positional ids (`kasane.ai.*`, the removed AI feature) are dropped.
 * - Neither: a fresh state.
 */
function load(): { state: State; dirty: boolean; migrated?: boolean } {
  let raw: string | null = null
  let legacyRaw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
    // also when the v4 text is damaged: the copy from before stable ids beats starting from nothing
    if (!parseStored(raw)) legacyRaw = localStorage.getItem(LEGACY_KEY)
  } catch {
    /* storage unavailable: start fresh */
  }
  const cur = parseStored(raw)
  if (cur) {
    const s = migrate(cur)
    // an API key from the removed AI feature is taken out of storage right away, not at the next answer
    const next = withLegacy(s)
    return { state: next, dirty: next !== s || 'apiKey' in cur.settings }
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  const old = parseStored(legacyRaw)
  if (old) {
    try {
      const s = migrate(old)
      s.legacy = { h: fingerprint(legacyRaw!) }
      // how long the one-time migration took (parse + translate + fingerprint), for devtools and the e2e timing
      try {
        performance.measure('kasane.migrate', { start: t0 })
      } catch {
        /* no User Timing */
      }
      return { state: s, dirty: true, migrated: true }
    } catch (e) {
      // never expected (migrate only renames keys); the old copy stays untouched and is tried again next launch
      loadError = e instanceof Error ? e : new Error(String(e))
      return { state: initial(), dirty: false }
    }
  }
  return { state: initial(), dirty: false }
}

/** Remove caches whose keys hold positional word ids (the removed AI feature's `kasane.ai.<level>-<idx>`). */
function dropPositionalCaches() {
  try {
    const ai: string[] = []
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('kasane.ai.')) ai.push(localStorage.key(i)!)
    ai.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* only caches */
  }
}

const loadStart = typeof performance !== 'undefined' ? performance.now() : 0
const first = load()
try {
  performance.measure('kasane.load', { start: loadStart })
} catch {
  /* no User Timing */
}
let state = first.state
const subs = new Set<() => void>()

// Another tab or window of the app saved: take its state, or the next save here would overwrite its progress.
// A tab still running the version before stable ids saved (LEGACY_KEY): merge its records in, card by card.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (loadError) return
    if (e.key === LEGACY_KEY) {
      const next = withLegacy(state)
      if (next !== state) update((d) => Object.assign(d, next))
      return
    }
    if (e.key !== KEY && e.key !== null) return
    const { state: next, dirty } = load()
    state = next
    if (dirty) save(JSON.stringify(state))
    subs.forEach((f) => f())
  })

export const getState = () => state

// ── save status: the app keeps working in memory when saving fails, but the user has to know ──

/** `failed`: the last save did not reach storage. `dismissed`: the user closed the warning for this run of failures. */
export interface SaveStatus {
  failed: boolean
  dismissed: boolean
}
let saveStatus: SaveStatus = { failed: false, dismissed: false }
const saveSubs = new Set<() => void>()
function setSaveStatus(next: SaveStatus) {
  if (next.failed === saveStatus.failed && next.dismissed === saveStatus.dismissed) return
  saveStatus = next
  saveSubs.forEach((f) => f())
}
export const getSaveStatus = () => saveStatus
/** Hide the warning until a save succeeds and then fails again. */
export const dismissSaveWarning = () => setSaveStatus({ failed: saveStatus.failed, dismissed: true })
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (f) => {
      saveSubs.add(f)
      return () => saveSubs.delete(f)
    },
    () => saveStatus,
  )
}

const trySet = (raw: string) => {
  try {
    localStorage.setItem(KEY, raw)
    return true
  } catch {
    return false
  }
}

/**
 * Store the state. When storage is full, give up, in this order and only as far as needed, what can be done
 * without: AI explanations (kasane.ai.*, can be fetched again — and the feature is gone); the import-undo copy
 * (PREV_KEY: undo works from memory, nothing reads the stored copy back); and last, the pre-migration copy
 * (LEGACY_KEY), only once this state contains it (`legacy` fingerprint matches) and only in exchange for storing
 * this state — if even then the state does not fit, the copy is put back. Study progress itself is never given up.
 */
function write(raw: string): boolean {
  if (trySet(raw)) return true
  try {
    const ai: string[] = []
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('kasane.ai.')) ai.push(localStorage.key(i)!)
    if (ai.length) {
      ai.forEach((k) => localStorage.removeItem(k))
      if (trySet(raw)) return true
    }
    if (localStorage.getItem(PREV_KEY) !== null) {
      localStorage.removeItem(PREV_KEY)
      if (trySet(raw)) return true
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy !== null && state?.legacy?.h === fingerprint(legacy)) {
      localStorage.removeItem(LEGACY_KEY)
      if (trySet(raw)) return true
      localStorage.setItem(LEGACY_KEY, legacy)
    }
  } catch {
    /* storage unusable */
  }
  return false
}

// ── hooks for the platform layer (src/platform): the iOS app mirrors every save to a durable file ──

export interface StoreHooks {
  /** after every save, with the saved text, whether or not localStorage took it */
  onSave?: (raw: string) => void
  /** after "모든 기록 초기화" */
  onReset?: () => void
}
let hooks: StoreHooks = {}
export const setStoreHooks = (h: StoreHooks) => {
  hooks = h
}

function save(raw: string) {
  // a state that could not be migrated is never saved: the old copy must stay what it was
  if (loadError) return
  if (write(raw)) setSaveStatus({ failed: false, dismissed: false })
  // keep working in memory; a warning is shown once per run of failures
  else if (!saveStatus.failed) setSaveStatus({ failed: true, dismissed: false })
  hooks.onSave?.(raw)
}

/** Copy-on-write update: `mutate` receives a shallow copy and must replace (not mutate) nested objects it changes. */
export function update(mutate: (draft: State) => void) {
  const prevRev = state.rev ?? 0
  const draft = { ...state, settings: { ...state.settings } }
  mutate(draft)
  // counts up from the copy that was current, whatever `mutate` put there (an import brings its own number)
  draft.rev = prevRev + 1
  state = draft
  save(JSON.stringify(state))
  subs.forEach((f) => f())
}

/**
 * Take a saved state found outside localStorage (the iOS app's durable copy, before the first render), of any
 * version: a v2/v3 copy goes through the same migration as localStorage. localStorage gets the (migrated) state
 * too when it can; when it cannot (full), the app still starts from it in memory.
 * Returns false, changing nothing, when the text is not a usable state.
 */
export function hydrate(raw: string): boolean {
  const s = parseStored(raw)
  if (!s || loadError) return false
  const next = migrate(s)
  // The launch chose this copy over localStorage, so whatever LEGACY_KEY holds now (the copy of the version before
  // stable ids, if any) is accounted for: it must not be merged in later. Without one, the migrated text is.
  let legacyRaw: string | null = null
  try {
    legacyRaw = localStorage.getItem(LEGACY_KEY)
  } catch {
    /* unreadable: nothing to merge later either */
  }
  if (legacyRaw) next.legacy = { h: fingerprint(legacyRaw) }
  else if (s.v !== STATE_VERSION) next.legacy = { h: fingerprint(raw) }
  state = next
  save(JSON.stringify(state))
  subs.forEach((f) => f())
  return true
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => sel(state),
  )
}

export function replaceState(next: State | StoredState) {
  const full = migrate(next as StoredState)
  // device-only bookkeeping stays with the device, whatever the new state brings
  const legacy = state.legacy
  update((d) => {
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]
    Object.assign(d, full)
    if (legacy) d.legacy = legacy
    else delete d.legacy
  })
}

/**
 * Whether parsed JSON is a backup this app can load without crashing (cards and log are read on every screen):
 * a state of this version or of v2/v3 (migrated on import). v2/v3 card ids are positional and must have named
 * a word (any other id makes the file invalid, as before); v4 ids must be well formed, and a well-formed id this
 * version does not know (a newer word list, a retired word) is accepted and kept apart (`orphans`).
 */
export function isBackup(x: unknown): x is StoredState {
  if (!isObj(x) || (x.v !== 2 && x.v !== 3 && x.v !== 4) || !isObj(x.settings) || !isObj(x.cards)) return false
  const t = x.settings.target
  if (t !== undefined && !LEVELS.includes(t as Level)) return false
  for (const [id, c] of Object.entries(x.cards)) {
    if (x.v === 4) {
      const i = id.indexOf(':')
      if (!WORD_ID.test(i < 0 ? id : id.slice(0, i)) || (i >= 0 && id.slice(i) !== ':r')) return false
    } else {
      // reading cards (`:r`) exist from v3 on
      const m = LEGACY_ID.exec(id)
      if (!m || (m[3] && x.v !== 3) || fromLegacy(id) === undefined) return false
    }
    if (!isCard(c)) return false
  }
  // every field of a day's log is a count (a text there showed "NaN" on Home)
  if (x.log !== undefined && (!isObj(x.log) || !Object.values(x.log).every((l) => isObj(l) && Object.values(l).every(isNum)))) return false
  if (x.marks !== undefined && !Array.isArray(x.marks)) return false
  if (x.xp !== undefined && !isNum(x.xp)) return false
  if (x.orphans !== undefined) {
    const o = x.orphans
    if (!isObj(o) || !isObj(o.cards) || !Array.isArray(o.marks) || !Object.values(o.cards).every(isCard)) return false
  }
  return true
}

// ── import with undo ──

/** The state before an import made in this session (also kept under PREV_KEY in case of a reload). */
let beforeImport: string | null = null

/** Replace the state with a validated backup, keeping the current state so the import can be undone. */
export function importState(next: State | StoredState) {
  beforeImport = JSON.stringify(state)
  try {
    localStorage.setItem(PREV_KEY, beforeImport)
  } catch {
    /* the in-memory copy still allows undo in this session */
  }
  replaceState(next)
}

/** Whether an import made in this session can be undone. */
export const canUndoImport = () => beforeImport !== null

export function undoImport(): boolean {
  if (beforeImport === null) return false
  let prev: unknown
  try {
    prev = JSON.parse(beforeImport)
  } catch {
    return false
  }
  if (!isBackup(prev)) return false
  beforeImport = null
  replaceState(prev)
  try {
    localStorage.removeItem(PREV_KEY)
  } catch {
    /* nothing to clean up */
  }
  return true
}

export function resetAll() {
  update((d) => {
    Object.assign(d, initial())
    delete d.orphans
    delete d.legacy
  })
  // "모든 기록 초기화" also removes the copy kept from before stable ids (it is a record too)
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* nothing more to remove */
  }
  hooks.onReset?.()
}

export function toggleMark(id: string) {
  update((d) => {
    d.marks = d.marks.includes(id) ? d.marks.filter((m) => m !== id) : [id, ...d.marks]
  })
}

export { LEVELS }

// The first load's migration or merge is stored at once (not at the next answer), so the migrated state exists
// before anything else runs; the positional caches go with it. Failing to store it is the usual save failure:
// the app runs from memory with the warning, LEGACY_KEY is untouched, and the next launch migrates again.
if (first.migrated) dropPositionalCaches()
if (first.dirty) save(JSON.stringify(state))
