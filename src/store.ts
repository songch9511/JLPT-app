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

const KEY = 'kasane.state.v2'

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

function save(raw: string) {
  try {
    localStorage.setItem(KEY, raw)
  } catch {
    // Storage full: AI explanations (kasane.ai.*) can be fetched again, study progress cannot.
    try {
      const ai: string[] = []
      for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('kasane.ai.')) ai.push(localStorage.key(i)!)
      if (!ai.length) return
      ai.forEach((k) => localStorage.removeItem(k))
      localStorage.setItem(KEY, raw)
    } catch {
      /* keep working in memory */
    }
  }
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

export function resetAll() {
  update((d) => Object.assign(d, initial()))
}

export function toggleMark(id: string) {
  update((d) => {
    d.marks = d.marks.includes(id) ? d.marks.filter((m) => m !== id) : [id, ...d.marks]
  })
}

export { LEVELS }
