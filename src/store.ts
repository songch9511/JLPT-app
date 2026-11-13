import { useSyncExternalStore } from 'react'
import { COUNTS, LEVELS, type Level } from './data'
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
  /** 3 since the cognate fast-track (reading cards `<id>:r`, `settings.fastTrack`); 2 before. */
  v: 3
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
  /** keys: `<level>-<idx>` meaning card, `<level>-<idx>:r` reading card */
  cards: Record<string, SCard>
  log: Record<string, DayLog>
  marks: string[]
  xp: number
  /** highest expected recall reached so far: journey stamps once earned stay (03 §6) */
  bestE?: number
}

// storage keys keep the app's former name (Kasane) so existing learners keep their records
/** New words a day never go above this, whatever the setting or an older saved value says (03 §5.1). */
export const MAX_DAILY_NEW = 40
export const GOALS = [0.7, 0.8, 0.9] as const

const KEY = 'kasane.state.v2'
export const STATE_KEY = KEY
/** The state as it was just before the last import, so the import can be undone. */
export const PREV_KEY = 'kasane.state.prev'

export const STATE_VERSION = 3

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

/** A state as saved by this or an earlier version: `v: 2` before the fast-track. */
export type StoredState = Omit<State, 'v' | 'settings'> & { v: 2 | 3; settings: Partial<State['settings']> & { target: Level } }

/**
 * A saved or imported state, completed with defaults for fields added since it was written, at the current
 * version. v2 → v3 (the fast-track): `fastTrack` defaults to on; cards keep their keys and content, so words
 * already learned with a meaning card keep it and only words introduced from now on can get a reading card.
 * Within v2 fields were only added: a missing `includeLower` means a learner from before the setting (kept off
 * so their plan does not suddenly grow); `dailyNew` is held to MAX_DAILY_NEW; the API key of the removed AI
 * feature is dropped.
 */
export function migrate(s: StoredState): State {
  return normalize({ ...s, v: STATE_VERSION } as State)
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
  return { ...base, ...s, v: STATE_VERSION, settings }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as StoredState
      if (s && typeof s === 'object' && s.settings && typeof s.settings === 'object') {
        const next = migrate(s)
        // an API key from the removed AI feature is taken out of storage right away, not at the next answer
        // (an older version's state is otherwise saved migrated at the next change)
        if ('apiKey' in s.settings)
          try {
            localStorage.setItem(KEY, JSON.stringify(next))
          } catch {
            /* dropped from memory at least; the next save removes it */
          }
        return next
      }
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initial()
}

let state = load()
const subs = new Set<() => void>()

// Another tab or window of the app saved: take its state, or the next save here would overwrite its progress.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return
    state = load()
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

function write(raw: string): boolean {
  try {
    localStorage.setItem(KEY, raw)
    return true
  } catch {
    // Storage full: AI explanations (kasane.ai.*) can be fetched again, study progress cannot.
    try {
      const ai: string[] = []
      for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('kasane.ai.')) ai.push(localStorage.key(i)!)
      if (!ai.length) return false
      ai.forEach((k) => localStorage.removeItem(k))
      localStorage.setItem(KEY, raw)
      return true
    } catch {
      return false
    }
  }
}

function save(raw: string) {
  if (write(raw)) setSaveStatus({ failed: false, dismissed: false })
  // keep working in memory; a warning is shown once per run of failures
  else if (!saveStatus.failed) setSaveStatus({ failed: true, dismissed: false })
}

/** Copy-on-write update: `mutate` receives a shallow copy and must replace (not mutate) nested objects it changes. */
export function update(mutate: (draft: State) => void) {
  const draft = { ...state, settings: { ...state.settings } }
  mutate(draft)
  state = draft
  save(JSON.stringify(state))
  subs.forEach((f) => f())
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
  update((d) => {
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]
    Object.assign(d, full)
  })
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x)

/**
 * Whether parsed JSON is a backup this app can load without crashing (cards and log are read on every screen):
 * a state of this version or of v2 (migrated on import).
 */
export function isBackup(x: unknown): x is StoredState {
  if (!isObj(x) || (x.v !== 2 && x.v !== 3) || !isObj(x.settings) || !isObj(x.cards)) return false
  const t = x.settings.target
  if (t !== undefined && !LEVELS.includes(t as Level)) return false
  for (const [id, c] of Object.entries(x.cards)) {
    // reading cards (`:r`) exist from v3 on
    const m = (x.v === 3 ? /^([1-5])-(\d+)(?::r)?$/ : /^([1-5])-(\d+)$/).exec(id)
    if (!m || Number(m[2]) >= COUNTS[Number(m[1]) as Level]) return false
    if (!isObj(c) || !isNum(c.due) || !isNum(c.state)) return false
  }
  if (x.log !== undefined && (!isObj(x.log) || !Object.values(x.log).every((l) => isObj(l)))) return false
  if (x.marks !== undefined && !Array.isArray(x.marks)) return false
  if (x.xp !== undefined && !isNum(x.xp)) return false
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
  update((d) => Object.assign(d, initial()))
}

export function toggleMark(id: string) {
  update((d) => {
    d.marks = d.marks.includes(id) ? d.marks.filter((m) => m !== id) : [id, ...d.marks]
  })
}

export { LEVELS }
