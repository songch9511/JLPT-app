// The first run (docs/design-system.md §3 "급수 고르기"): no onboarding page and no explanations. A new learner is
// asked the one thing the plan needs, the level, as five level cards (screens/LevelPicker.tsx), then lands on Home.
//
// Progress lives in `State.guide.done` (store.ts). A state without `guide` — every learner from before the first run
// existed, and their backups — never sees the question. The one-time tips Ruma used to say (spaced repetition, the
// reading card) are gone with Ruma's lines; their ids are dropped from saved states (store.ts RETIRED_GUIDE).
import { update, type State } from './store'

/** Answered steps of the first run. */
export type Step = 'level'

export const done = (s: Pick<State, 'guide'>, id: Step) => !!s.guide?.done.includes(id)

/** Whether anything has been studied yet (an answer on any day, or any card). */
export const studied = (s: Pick<State, 'cards' | 'log'>) => Object.keys(s.cards).length > 0 || Object.values(s.log).some((l) => (l?.c ?? 0) > 0)

/**
 * Where the first run stands: `level` while the level is asked, `start` until the first answer (Home's new-words
 * button is then named as the first session, and there is no streak yet), `null` after that and for every learner
 * without a guide.
 */
export type Phase = 'level' | 'start' | null
export function phase(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>): Phase {
  if (!s.guide) return null
  if (!s.onboarded) return 'level'
  return studied(s) ? null : 'start'
}

/** The level answers the first-run question: the plan is complete and the first session can start. */
export const chooseLevel = (target: State['settings']['target']) =>
  update((d) => {
    d.settings.target = target
    d.onboarded = true
    d.guide = { done: [...new Set([...(d.guide?.done ?? []), 'level'])] }
  })
