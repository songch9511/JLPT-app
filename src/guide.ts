// Ruma's first run (docs/design-system.md §3 "루마의 안내"): no onboarding page. A new learner lands on Home, where
// Ruma asks the two things the plan needs (level, exam date) one at a time in the mascot card, then offers the first
// session; what the app does is explained once each, in context, when it becomes relevant.
//
// Progress lives in `State.guide.done` (store.ts). A state without `guide` — every learner from before this version,
// and their backups — never sees any of it.
import { update, type State } from './store'
import { upcomingExams } from './util'

/** Answered steps of the first-run conversation, and a note that the exam date was not known. */
export type Step = 'level' | 'exam' | 'exam-unknown'
/** In-context tips, each shown once: spaced repetition (after the first study), reading cards, the readiness figure. */
export type Tip = 'srs' | 'reading' | 'ready'

export const done = (s: Pick<State, 'guide'>, id: Step | Tip) => !!s.guide?.done.includes(id)

export function markDone(...ids: (Step | Tip)[]) {
  update((d) => {
    if (!d.guide || ids.every((id) => d.guide!.done.includes(id))) return
    d.guide = { done: [...new Set([...d.guide.done, ...ids])] }
  })
}

/** Whether anything has been studied yet (an answer on any day, or any card). */
export const studied = (s: Pick<State, 'cards' | 'log'>) => Object.keys(s.cards).length > 0 || Object.values(s.log).some((l) => (l?.c ?? 0) > 0)

/**
 * Where the first run stands: `level` and `exam` while Ruma asks, `start` until the first answer (Ruma offers the first
 * session at the top of Home), `null` after that and for every learner without a guide.
 */
export type Phase = 'level' | 'exam' | 'start' | null
export function phase(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>): Phase {
  if (!s.guide) return null
  if (!s.onboarded) return done(s, 'level') ? 'exam' : 'level'
  return studied(s) ? null : 'start'
}

/** The Home tip due now, if any: after the first study, then once the readiness status has something to say. */
export function homeTip(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>, readinessStatusKnown: boolean): Tip | null {
  if (!s.guide || !s.onboarded || !studied(s)) return null
  if (!done(s, 'srs')) return 'srs'
  if (readinessStatusKnown && !done(s, 'ready')) return 'ready'
  return null
}

export const chooseLevel = (target: State['settings']['target']) =>
  update((d) => {
    d.settings.target = target
    d.guide = { done: [...new Set([...(d.guide?.done ?? []), 'level'])] }
  })

/** Back to the level question from the exam question. */
export const askLevelAgain = () =>
  update((d) => {
    if (d.guide) d.guide = { done: d.guide.done.filter((x) => x !== 'level') }
  })

/**
 * The exam date, or `null` for "아직 몰라요": the app always plans for a date, so it keeps the default every new
 * state starts with (store.ts `initial`: the next JLPT date) and says so; settings change it any time.
 */
export const chooseExam = (examDate: string | null, now = new Date()) =>
  update((d) => {
    d.settings.examDate = examDate ?? upcomingExams(now)[0]
    d.onboarded = true
    const keep = (d.guide?.done ?? []).filter((x) => x !== 'exam-unknown')
    d.guide = { done: [...new Set([...keep, 'level', 'exam', ...(examDate ? [] : ['exam-unknown'])])] }
  })

/** Settings › "루마의 안내 다시 보기": the tips come back (the first-run questions do not: they are settings now). */
export const replayTips = () =>
  update((d) => {
    d.guide = { done: (d.guide?.done ?? ['level', 'exam']).filter((x) => x !== 'srs' && x !== 'reading' && x !== 'ready') }
    if (!d.guide.done.includes('level')) d.guide.done.push('level', 'exam')
  })
