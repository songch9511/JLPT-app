// Ruma's first run (docs/design-system.md §3 "루마의 안내"): no onboarding page. A new learner lands on Home, where
// Ruma asks the one thing the plan needs (the level) in the sky, with the answers in the plan sheet, then the sheet
// offers the first session; what the app does is explained once each, in context, when it becomes relevant.
//
// Progress lives in `State.guide.done` (store.ts). A state without `guide` — every learner from before this version,
// and their backups — never sees any of it.
import { update, type State } from './store'

/** Answered steps of the first-run conversation. */
export type Step = 'level'
/** In-context tips, each shown once: spaced repetition (after the first study), reading cards. */
export type Tip = 'srs' | 'reading'

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
 * Where the first run stands: `level` while Ruma asks, `start` until the first answer (Ruma offers the first session at
 * the top of Home), `null` after that and for every learner without a guide.
 */
export type Phase = 'level' | 'start' | null
export function phase(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>): Phase {
  if (!s.guide) return null
  if (!s.onboarded) return 'level'
  return studied(s) ? null : 'start'
}

/** The Home tip due now, if any: once, after the first study. */
export function homeTip(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>): Tip | null {
  if (!s.guide || !s.onboarded || !studied(s)) return null
  return done(s, 'srs') ? null : 'srs'
}

/** The level answers the first-run question: the plan is complete and the first session can start. */
export const chooseLevel = (target: State['settings']['target']) =>
  update((d) => {
    d.settings.target = target
    d.onboarded = true
    d.guide = { done: [...new Set([...(d.guide?.done ?? []), 'level'])] }
  })

/** "급수 다시 고르기" before the first session: back to the level question. */
export const askLevelAgain = () =>
  update((d) => {
    if (!d.guide) return
    d.guide = { done: d.guide.done.filter((x) => x !== 'level') }
    d.onboarded = false
  })

/** Settings › "루마의 안내 다시 보기": the tips come back (the first-run question does not: it is a setting now). */
export const replayTips = () =>
  update((d) => {
    d.guide = { done: (d.guide?.done ?? ['level']).filter((x) => x !== 'srs' && x !== 'reading') }
    if (!d.guide.done.includes('level')) d.guide.done.push('level')
  })
