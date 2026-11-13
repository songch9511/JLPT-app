import { vi } from 'vitest'
import type { SCard, State } from '../../src/store'

export const KEY = 'kasane.state.v2'

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
export async function boot(opts: { now: string | Date; saved?: unknown; storage?: MemoryStorage } = { now: '2026-11-13T09:00:00' }) {
  vi.setSystemTime(new Date(opts.now))
  const ls = opts.storage ?? new MemoryStorage()
  if (opts.saved !== undefined) ls.setItem(KEY, typeof opts.saved === 'string' ? opts.saved : JSON.stringify(opts.saved))
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
