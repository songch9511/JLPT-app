// What the home-screen widget shows (docs/plan/06 §1.2 ⑤), computed by the app and handed to the widget
// extension through the App Group container (ios/App/RumaWidget). The widget cannot run the scheduler, so
// the app gives it one entry per day for the next week; the widget's timeline switches entries at midnight
// and the app refreshes them whenever the state changes or it comes to the foreground.
import { studyProgress } from '../srs'
import type { State } from '../store'
import { addDays, dayKey } from '../util'
import { HORIZON_DAYS, workOn } from './reminders'

/**
 * Still 1: the payload only gained fields (`met`, `mature`). The fields of the removed exam-day estimate are still
 * written with inert values (`plan: null`, `goal: 0`, `examDate: ''`) so a widget built before their removal decodes
 * the snapshot (its decoder requires them) and keeps showing today's counts; the widget of this version ignores them.
 */
export const WIDGET_SNAPSHOT_VERSION = 1

export interface WidgetDay {
  /** yyyy-mm-dd, local */
  day: string
  /** reviews waiting that day (if nothing is studied before) */
  due: number
  /** new words the plan offers that day */
  fresh: number
  /** today only: everything was done */
  done: boolean
}

export interface WidgetSnapshot {
  v: typeof WIDGET_SNAPSHOT_VERSION
  /** epoch ms when written */
  at: number
  onboarded: boolean
  /** e.g. "N3" or "N5~N3" */
  levels: string
  /** words in the studied levels */
  total: number
  /** …of which met (introduced), and in long-term memory: the counts of Home's word card */
  met: number
  mature: number
  days: WidgetDay[]
  /** retired with the exam-day estimate: always null, 0 and '' (see WIDGET_SNAPSHOT_VERSION) */
  plan: null
  goal: 0
  examDate: ''
}

export function widgetSnapshot(s: State, now: Date): WidgetSnapshot {
  const days: WidgetDay[] = []
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), i)
    const w = workOn(s, day, now)
    days.push({ day: dayKey(day), due: w.reviews, fresh: w.fresh, done: w.done })
  }
  const { levels: lv, total, met, mature } = studyProgress(s)
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    at: now.getTime(),
    onboarded: s.onboarded,
    levels: lv.length === 1 ? `N${lv[0]}` : `N${lv[0]}~N${lv[lv.length - 1]}`,
    total,
    met,
    mature,
    days,
    plan: null,
    goal: 0,
    examDate: '',
  }
}
