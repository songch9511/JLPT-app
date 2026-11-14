// Review reminders for the iOS app (docs/plan/06 §1.2 ①, 10-ios-build.md §알림): what to schedule, as a pure
// function of the study state, the learner's choices and the time. The native layer cancels what it scheduled
// before and schedules exactly this list whenever the state changes, the app comes back to the foreground or
// a setting changes, so the list is always the whole truth for the next days.
//
// Rules
// - off → nothing.
// - at most one a day, at the chosen time, for the next HORIZON_DAYS days (iOS keeps at most 64 pending
//   local notifications per app; a week of dailies stays far below that and is re-planned on every open).
// - only on days with reviews due by the end of that day, assuming the learner does nothing before then
//   (re-planning after each session corrects it); at most the day's review cap, as the queue would show them. New words alone do not trigger a reminder: they are not due.
// - never on a day already completed: today once something was answered and nothing is left or waiting.
// - never on the learner's quiet weekdays, never in the past.
// - the message states the real counts.
import { buildQueue, isActive, newPerDay, newWordsLeft, reviewCap } from '../srs'
import type { State } from '../store'
import { addDays, dayKey } from '../util'
import { wordOfCard } from '../data'

export interface ReminderPrefs {
  enabled: boolean
  /** local time of the reminder */
  hour: number
  minute: number
  /** weekdays without a reminder, 0 = Sunday … 6 = Saturday (Date#getDay) */
  quietDays: number[]
}

export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, hour: 20, minute: 0, quietDays: [] }

export const HORIZON_DAYS = 7

export interface PlannedReminder {
  /** stable per day (yyyymmdd), so one day can never hold two of them; fits the 32-bit ids iOS plugins use */
  id: number
  /** epoch ms */
  at: number
  day: string
  reviews: number
  fresh: number
  title: string
  body: string
}

/** Our notification ids are the reminder's day as yyyymmdd; nothing else in the app schedules notifications. */
export const isReminderId = (id: number) => id >= 2000_01_01 && id <= 2999_12_31

export const reminderId = (d: Date) => Number(dayKey(d).replace(/-/g, ''))

/**
 * Reviews and new words waiting on `day` if nothing is studied before then: cards (active, one per word, as
 * the queue shows them) due before that day ends. For today the queue itself answers, which also knows what
 * was already answered today.
 */
export function workOn(s: State, day: Date, now: Date): { reviews: number; fresh: number; done: boolean } {
  if (dayKey(day) === dayKey(now)) {
    const q = buildQueue(s, now)
    const answered = s.log[dayKey(now)]?.c ?? 0
    return { reviews: q.review + q.learning, fresh: q.fresh, done: answered > 0 && !q.next && q.waiting === 0 }
  }
  const eod = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const ft = s.settings.fastTrack !== false
  const words = new Set<string>()
  for (const id in s.cards) if (isActive(id, ft) && s.cards[id].due < eod) words.add(wordOfCard(id))
  // as the queue would show that day: reviews up to the day's cap (the rest wait, 03 §5.3), fewer new words then
  const cap = reviewCap(s, now)
  const fresh = Math.min(newPerDay(s.settings.dailyNew, words.size > cap), newWordsLeft(s))
  return { reviews: Math.min(words.size, cap), fresh, done: false }
}

export function reminderText(reviews: number, fresh: number): { title: string; body: string } {
  return {
    title: `복습할 단어 ${reviews}개가 돌아왔어요`,
    body: fresh > 0 ? `새 단어 ${fresh}개도 기다리고 있어요. 잊기 전에 한 겹 더 쌓아요.` : '잊기 전에 한 번 더 보면 오래 남아요.',
  }
}

/** The reminders to have scheduled from `now` on, earliest first. */
export function planReminders(s: State, prefs: ReminderPrefs, now: Date, horizon = HORIZON_DAYS): PlannedReminder[] {
  if (!prefs.enabled || !s.onboarded) return []
  const out: PlannedReminder[] = []
  const quiet = new Set(prefs.quietDays)
  for (let i = 0; i < horizon; i++) {
    const day = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), i)
    if (quiet.has(day.getDay())) continue
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prefs.hour, prefs.minute).getTime()
    if (at <= now.getTime()) continue
    const w = workOn(s, day, now)
    if (w.done || w.reviews === 0) continue
    out.push({ id: reminderId(day), at, day: dayKey(day), reviews: w.reviews, fresh: w.fresh, ...reminderText(w.reviews, w.fresh) })
  }
  return out
}
