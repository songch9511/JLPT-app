import { vi } from 'vitest'
import { fromLegacy, legacySeed } from '../../src/ids'
import type { SCard, State } from '../../src/store'

/** Where the state is saved since stable word ids (v4). */
export const KEY = 'kasane.state.v4'
/** Where the versions before stable ids saved it (v2/v3, positional ids): migrated from, then kept untouched. */
export const LEGACY_KEY = 'kasane.state.v2'

/**
 * The stable id of a word named by its old positional id (`L('5-0')` = `w000`, `L('3-17:r')` reading card), so a
 * test can say which word it means the way the data files were read before stable ids.
 */
export const L = (legacy: string) => {
  const id = fromLegacy(legacy)
  if (!id) throw new Error(`no word ${legacy}`)
  return id
}

/** Cards keyed by stable ids, keyed instead as the version before stable ids saved them (`w000` → `5-0`). */
export const legacyKeys = <T>(cards: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(cards).map(([id, c]) => [legacySeed(id), c]))

/** In-memory Storage with an optional byte quota, to stand in for the browser's localStorage. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  /** total UTF-16 code units allowed across keys and values (browsers allow roughly 5M) */
  quota = Infinity
  failReads = false

  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    if (this.failReads) throw new DOMException('denied', 'SecurityError')
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    const value = String(v)
    let used = 0
    for (const [kk, vv] of this.map) if (kk !== k) used += kk.length + vv.length
    if (used + k.length + value.length > this.quota) throw new DOMException('quota', 'QuotaExceededError')
    this.map.set(k, value)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

/**
 * Fresh copies of the app modules with the clock set to `now` and localStorage seeded with `saved`.
 * The store reads localStorage when it is first imported, so every test boots its own module graph.
 */
export async function boot(opts: { now: string | Date; saved?: unknown; legacy?: unknown; storage?: MemoryStorage } = { now: '2026-11-13T09:00:00' }) {
  vi.setSystemTime(new Date(opts.now))
  const ls = opts.storage ?? new MemoryStorage()
  if (opts.saved !== undefined) ls.setItem(KEY, typeof opts.saved === 'string' ? opts.saved : JSON.stringify(opts.saved))
  // a state saved by the version before stable ids, under its key
  if (opts.legacy !== undefined) ls.setItem(LEGACY_KEY, typeof opts.legacy === 'string' ? opts.legacy : JSON.stringify(opts.legacy))
  vi.stubGlobal('localStorage', ls)
  vi.resetModules()
  const store = await import('../../src/store')
  const srs = await import('../../src/srs')
  const util = await import('../../src/util')
  return { store, srs, util, ls }
}

/** Boot an onboarded user with the given settings. */
export async function bootUser(now: string | Date, settings: Partial<State['settings']> = {}, extra: Partial<State> = {}) {
  const b = await boot({ now })
  b.store.update((d) => {
    d.onboarded = true
    Object.assign(d.settings, settings)
    Object.assign(d, extra)
  })
  return b
}

export const at = (s: string) => new Date(s)
export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

/** A hand-made scheduled card; only the fields the queue and stats look at matter. */
export function card(p: Partial<SCard> & { due: number }): SCard {
  return {
    stability: 5,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 3,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: p.due - 3 * DAY,
    ...p,
  }
}
