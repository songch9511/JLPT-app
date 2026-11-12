import { useSyncExternalStore } from 'react'
import { COUNTS, LEVELS, STAGE_SIZE, stageCount, stageRange, wordId, type Level } from './data'
import { addDays, dayKey, shuffle, upcomingExams } from './util'

export interface Session {
  level: Level
  stage: number
  /** word indexes still to answer in the current pass (first = current card) */
  queue: number[]
  /** words marked "study again" in this pass; they come back in the next pass */
  again: number[]
  pass: number
  total: number
  /** stage counts toward level progress (false when replaying a finished stage) */
  counts: boolean
}

export interface DayLog {
  /** cards answered */
  c: number
  /** answered "known" */
  k: number
  /** stages finished */
  s: number
}

export interface State {
  v: 1
  onboarded: boolean
  settings: {
    target: Level
    examDate: string
    theme: 'system' | 'light' | 'dark'
    apiKey: string
    autoSpeak: boolean
  }
  /** round = current 회독 (1-based); done = stages finished in the current round */
  levels: Record<Level, { round: number; done: number }>
  session: Session | null
  /** per word: [times known, times marked again] */
  stats: Record<string, [number, number]>
  log: Record<string, DayLog>
  marks: string[]
}

const KEY = 'kasane.state.v1'

function initial(): State {
  return {
    v: 1,
    onboarded: false,
    settings: { target: 5, examDate: upcomingExams()[0], theme: 'system', apiKey: '', autoSpeak: false },
    levels: Object.fromEntries(LEVELS.map((l) => [l, { round: 1, done: 0 }])) as State['levels'],
    session: null,
    stats: {},
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
      return { ...base, ...s, settings: { ...base.settings, ...s.settings }, levels: { ...base.levels, ...s.levels } }
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initial()
}

let state = load()
const subs = new Set<() => void>()

export const getState = () => state

export function update(mutate: (draft: State) => void) {
  const draft = structuredClone(state)
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

// ── study flow ──────────────────────────────────────────────────────────────

/** Stage `stage` = its 50 new words + the previous stage's words mixed in. */
export function startStage(level: Level, stage: number) {
  update((d) => {
    const fresh = stageRange(level, stage)
    const review = stage > 0 ? stageRange(level, stage - 1) : []
    const queue = shuffle([...fresh, ...review])
    d.session = {
      level,
      stage,
      queue,
      again: [],
      pass: 1,
      total: queue.length,
      counts: stage >= d.levels[level].done,
    }
  })
}

export type AnswerResult = 'next' | 'pass' | 'done'

/** Returns what happened after the answer: next card, a new pass started, or the stage finished. */
export function answer(known: boolean): AnswerResult {
  let result: AnswerResult = 'next'
  update((d) => {
    const s = d.session
    if (!s || !s.queue.length) return
    const idx = s.queue.shift()!
    const id = wordId(s.level, idx)
    const st = (d.stats[id] ??= [0, 0])
    st[known ? 0 : 1]++
    if (!known) s.again.push(idx)
    const log = (d.log[dayKey()] ??= { c: 0, k: 0, s: 0 })
    log.c++
    if (known) log.k++

    if (s.queue.length) return
    if (s.again.length) {
      s.queue = shuffle(s.again)
      s.again = []
      s.pass++
      result = 'pass'
      return
    }
    result = 'done'
    log.s++
    d.session = null
    if (s.counts) {
      const lv = d.levels[s.level]
      lv.done = Math.max(lv.done, s.stage + 1)
      if (lv.done >= stageCount(s.level)) {
        lv.round++
        lv.done = 0
      }
    }
  })
  return result
}

export function restoreSession(prev: { session: Session; stats: State['stats']; log: State['log'] }) {
  update((d) => {
    d.session = prev.session
    d.stats = prev.stats
    d.log = prev.log
  })
}

export function quitSession() {
  update((d) => {
    d.session = null
  })
}

export function toggleMark(id: string) {
  update((d) => {
    const i = d.marks.indexOf(id)
    if (i >= 0) d.marks.splice(i, 1)
    else d.marks.unshift(id)
  })
}

// ── derived ─────────────────────────────────────────────────────────────────

export function learnedCount(s: State, l: Level): number {
  return Math.min(s.levels[l].done * STAGE_SIZE, COUNTS[l])
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

/** Words the user keeps missing, most-missed first. */
export function weakIds(stats: State['stats'], limit = 30): string[] {
  return Object.entries(stats)
    .filter(([, [k, a]]) => a >= 2 && a > k - 1)
    .sort((x, y) => y[1][1] - y[1][0] - (x[1][1] - x[1][0]) || y[1][1] - x[1][1])
    .slice(0, limit)
    .map(([id]) => id)
}
