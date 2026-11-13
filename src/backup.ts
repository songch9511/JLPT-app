import { useSyncExternalStore } from 'react'
import { getState, isBackup, type State } from './store'
import { addDays, dayKey, daysBetween, parseDay } from './util'

// ── export format ──

export const BACKUP_FORMAT = 'jlpt-luma-backup'
export const BACKUP_FORMAT_VERSION = 1
declare const __APP_VERSION__: string | undefined
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** Fields a backup file carries next to the state; they are not part of the state itself. */
const ENVELOPE = ['format', 'formatVersion', 'app', 'exportedAt'] as const

/** The backup file's content: the state (without the API key) plus format fields next to the existing `v`. */
export function backupFile(s: State, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: `kasane ${APP_VERSION}`,
    exportedAt: now.toISOString(),
    ...s,
    // the API key stays on this device
    settings: { ...s.settings, apiKey: '' },
  }
}

export type ReadResult = { ok: true; state: State } | { ok: false; reason: 'invalid' | 'newer' }

/**
 * Reads a parsed backup file. Accepts this format and the earlier plain state (`{ v: 2, … }`) files;
 * returns the state with the format fields removed.
 */
export function readBackup(x: unknown): ReadResult {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return { ok: false, reason: 'invalid' }
  const o = x as Record<string, unknown>
  if (o.format !== undefined) {
    if (o.format !== BACKUP_FORMAT) return { ok: false, reason: 'invalid' }
    if (typeof o.formatVersion !== 'number') return { ok: false, reason: 'invalid' }
    if (o.formatVersion > BACKUP_FORMAT_VERSION) return { ok: false, reason: 'newer' }
  }
  const rest: Record<string, unknown> = { ...o }
  for (const k of ENVELOPE) delete rest[k]
  return isBackup(rest) ? { ok: true, state: rest } : { ok: false, reason: 'invalid' }
}

function download(json: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = name
  a.click()
  // revoking right away can cancel the download on some browsers (iOS home-screen apps)
  const href = a.href
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

/** Download the current state as a backup file and remember when. */
export function exportBackup() {
  download(JSON.stringify(backupFile(getState())), `kasane-backup-${dayKey()}.json`)
  setMeta({ lastExport: dayKey() })
}

/**
 * Download whatever is stored, without going through the store: used by the error screen, where the
 * stored state may be what is broken. The API key is removed when the text can be parsed.
 */
export function exportRaw(raw: string | null) {
  let json = raw ?? 'null'
  try {
    const s = JSON.parse(json)
    if (s && typeof s === 'object' && s.settings && typeof s.settings === 'object') s.settings.apiKey = ''
    json = JSON.stringify({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, app: `kasane ${APP_VERSION}`, exportedAt: new Date().toISOString(), ...s })
  } catch {
    json = json.replace(/"apiKey"\s*:\s*"[^"]*"/g, '"apiKey":""')
  }
  download(json, `kasane-backup-${dayKey()}.json`)
}

// ── device-only notes about backups (kept outside the study state, never exported) ──

export const META_KEY = 'kasane.meta'
export interface Meta {
  /** day of the last export */
  lastExport?: string
  /** the backup reminder stays hidden until this day */
  nudgeAfter?: string
  /** persistent storage was already requested */
  persistAsked?: boolean
}

let meta: Meta = readMeta()
const metaSubs = new Set<() => void>()

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
  } catch {
    return {}
  }
}

export const getMeta = () => meta

export function setMeta(patch: Partial<Meta>) {
  meta = { ...meta, ...patch }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* only a reminder: fine to keep in memory */
  }
  metaSubs.forEach((f) => f())
}

export function useMeta(): Meta {
  return useSyncExternalStore(
    (f) => {
      metaSubs.add(f)
      return () => metaSubs.delete(f)
    },
    () => meta,
  )
}

/** Days between reminders, and how much progress is worth a reminder. */
export const NUDGE_DAYS = 7
export const NUDGE_MIN_CARDS = 30

/** Show the one-line backup reminder: real progress, no export in the last week, not snoozed. */
export function shouldNudge(s: State, m: Meta, today: Date): boolean {
  if (Object.keys(s.cards).length < NUDGE_MIN_CARDS) return false
  if (m.lastExport && daysBetween(parseDay(m.lastExport), today) < NUDGE_DAYS) return false
  if (m.nudgeAfter && daysBetween(today, parseDay(m.nudgeAfter)) > 0) return false
  return true
}

export const snoozeNudge = (today = new Date()) => setMeta({ nudgeAfter: dayKey(addDays(today, NUDGE_DAYS)) })

/**
 * Ask the browser not to evict this site's storage (Safari deletes script storage of sites not visited
 * for a while). Asked once, after the first finished day, when the user has something worth keeping.
 */
export function requestPersist() {
  if (meta.persistAsked) return
  setMeta({ persistAsked: true })
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    /* not supported */
  }
}
