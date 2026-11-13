// Device settings of the iOS app: reminders, haptics, the Japanese voice. Kept apart from the study state on
// purpose — they belong to this phone (a notification permission, an installed voice) and must not travel
// in a backup to another device. Held in memory for synchronous reads by the screens; saved by native.ts.
import { useSyncExternalStore } from 'react'
import { DEFAULT_REMINDERS, type ReminderPrefs } from './reminders'

export interface NativePrefs {
  reminders: ReminderPrefs
  /** the in-app explanation before the permission request was shown (asked once, after a finished day) */
  reminderAsked: boolean
  haptics: boolean
  /** chosen Japanese voice (AVSpeechSynthesisVoice identifier); null: the system's default ja-JP voice */
  voiceURI: string | null
}

export const DEFAULT_PREFS: NativePrefs = { reminders: DEFAULT_REMINDERS, reminderAsked: false, haptics: true, voiceURI: null }

const int = (x: unknown, lo: number, hi: number, d: number) =>
  typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : d

/** Whatever was stored, completed with defaults; anything malformed falls back to the default. */
export function normalizePrefs(x: unknown): NativePrefs {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  const r = (typeof o.reminders === 'object' && o.reminders !== null ? o.reminders : {}) as Record<string, unknown>
  const d = DEFAULT_REMINDERS
  return {
    reminders: {
      enabled: r.enabled === true,
      hour: int(r.hour, 0, 23, d.hour),
      minute: int(r.minute, 0, 59, d.minute),
      quietDays: Array.isArray(r.quietDays) ? [...new Set(r.quietDays.filter((n) => int(n, 0, 6, -1) >= 0) as number[])].sort() : [],
    },
    reminderAsked: o.reminderAsked === true,
    haptics: o.haptics !== false,
    voiceURI: typeof o.voiceURI === 'string' && o.voiceURI ? o.voiceURI : null,
  }
}

let prefs: NativePrefs = DEFAULT_PREFS
const subs = new Set<() => void>()
let persist: (p: NativePrefs) => void = () => {}

export const getPrefs = () => prefs

/** Set what was loaded from disk (no save) and how later changes are saved. */
export function initPrefs(loaded: unknown, save: (p: NativePrefs) => void) {
  prefs = normalizePrefs(loaded)
  persist = save
  subs.forEach((f) => f())
}

export function setPrefs(patch: Partial<NativePrefs>) {
  prefs = normalizePrefs({ ...prefs, ...patch })
  persist(prefs)
  subs.forEach((f) => f())
}

export function usePrefs(): NativePrefs {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => prefs,
  )
}
