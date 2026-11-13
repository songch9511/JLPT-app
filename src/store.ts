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
}

export interface State {
  v: 2
  onboarded: boolean
  settings: {
    target: Level
    examDate: string
    dailyNew: number
    theme: 'system' | 'light' | 'dark'
    apiKey: string
    autoSpeak: boolean
  }
  cards: Record<string, SCard>
  log: Record<string, DayLog>
  marks: string[]
  xp: number
}

// storage keys keep the app's former name (Kasane) so existing learners keep their records
const KEY = 'kasane.state.v2'
export const STATE_KEY = KEY
/** The state as it was just before the last import, so the import can be undone. */
export const PREV_KEY = 'kasane.state.prev'

function initial(): State {
  return {
    v: 2,
    onboarded: false,
    settings: { target: 5, examDate: upcomingExams()[0], dailyNew: 20, theme: 'system', apiKey: '', autoSpeak: false },
    cards: {},
    log: {},
    marks: [],
    xp: 0,
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      const base = initial()
      return { ...base, ...s, settings: { ...base.settings, ...s.settings } }
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

export function replaceState(next: State) {
  const base = initial()
  update((d) => Object.assign(d, base, next, { settings: { ...base.settings, ...next.settings } }))
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x)

/** Whether parsed JSON is a backup this app can load without crashing (cards and log are read on every screen). */
export function isBackup(x: unknown): x is State {
  if (!isObj(x) || x.v !== 2 || !isObj(x.settings) || !isObj(x.cards)) return false
  const t = x.settings.target
  if (t !== undefined && !LEVELS.includes(t as Level)) return false
  for (const [id, c] of Object.entries(x.cards)) {
    const m = /^([1-5])-(\d+)$/.exec(id)
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
export function importState(next: State) {
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
