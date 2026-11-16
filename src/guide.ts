// The first run (docs/design-system.md §3 "시작"): no explanations beyond three short pages. A new learner picks the
// level from five level cards (screens/LevelCarousel.tsx), reads three intro pages — the card, the grades, the daily
// new words (screens/Intro.tsx) — and lands on Home.
//
// Progress lives in `State.guide.done` (store.ts). A state without `guide` — every learner from before the first run
// existed, and their backups — never sees it. 설정 › 처음 안내 다시 보기 opens the intro pages again (`#/intro`).
import { update, type State } from './store'

/** Answered steps of the first run. */
export type Step = 'level' | 'intro'

export const done = (s: Pick<State, 'guide'>, id: Step) => !!s.guide?.done.includes(id)

/** Whether anything has been studied yet (an answer on any day, or any card). */
export const studied = (s: Pick<State, 'cards' | 'log'>) => Object.keys(s.cards).length > 0 || Object.values(s.log).some((l) => (l?.c ?? 0) > 0)

/**
 * Where the first run stands: `level` while the level is asked, `intro` on the intro pages, `start` until the first
 * answer (Home's new-words button is then named as the first session), `null` after that and for every learner
 * without a guide.
 */
export type Phase = 'level' | 'intro' | 'start' | null
export function phase(s: Pick<State, 'guide' | 'onboarded' | 'cards' | 'log'>): Phase {
  if (!s.guide) return null
  if (!s.onboarded) return done(s, 'level') ? 'intro' : 'level'
  return studied(s) ? null : 'start'
}

const withStep = (d: State, step: Step) => ({ done: [...new Set([...(d.guide?.done ?? []), step])] })

/** The level answers the first question; the intro pages follow. */
export const chooseLevel = (target: State['settings']['target']) =>
  update((d) => {
    d.settings.target = target
    d.guide = withStep(d, 'level')
  })

/** Back from the intro pages to the level cards (the first run only). */
export const backToLevel = () =>
  update((d) => {
    d.guide = { done: (d.guide?.done ?? []).filter((x) => x !== 'level') }
  })

/** The intro is read (or skipped): the plan is complete and the first session can start. */
export const finishIntro = () =>
  update((d) => {
    d.onboarded = true
    d.guide = withStep(d, 'intro')
  })
