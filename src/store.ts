import { useSyncExternalStore } from 'react'
import { LEVELS, type Level } from './data'
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

export const getState = () => state

/** Copy-on-write update: `mutate` receives a shallow copy and must replace (not mutate) nested objects it changes. */
export function update(mutate: (draft: State) => void) {
  const draft = { ...state, settings: { ...state.settings } }
  mutate(draft)
  state = draft
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* keep working in memory */
  }
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

export function resetAll() {
  update((d) => Object.assign(d, initial()))
}

export function toggleMark(id: string) {
  update((d) => {
    d.marks = d.marks.includes(id) ? d.marks.filter((m) => m !== id) : [id, ...d.marks]
  })
}

export { LEVELS }
