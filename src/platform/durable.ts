// Durable copy of the study state for the iOS app (docs/plan/10-ios-build.md §저장).
//
// iOS may evict a web view's localStorage when the device runs low on space, and the app's whole history is
// one localStorage key. The app therefore keeps localStorage as the synchronous working copy (the store and
// every screen stay as they are) and mirrors each save to files in the app's Library directory, which the OS
// does not purge and which device backups include. At launch, before the first render, `reconcile` decides
// which copy to start from.
//
// Why files and not Capacitor Preferences (UserDefaults): the state is one JSON text that reaches hundreds of
// KB to ~2 MB for a learner who has seen every word (04 QA §3: 1.7 MB), and UserDefaults is meant for small
// values — it is read whole into memory at launch and Apple documents a size limit for it on some platforms.
// A file is written only when the state changes and read once at launch.
//
// Two files are written alternately ("slots"): a write cut off half-way (the app killed, the disk full) can
// only damage the slot being written, and the other still holds the previous save.

/** A copy of the state as text, with the save counter read from it (`State.rev`, 0 when absent). */
export interface Copy {
  raw: string
  rev: number
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** The text as a copy the store can load (the same shape check as the store's own `load`), or null. */
export function parseCopy(raw: string | null | undefined): Copy | null {
  if (typeof raw !== 'string' || raw === '') return null
  let x: unknown
  try {
    x = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(x) || !isObj(x.settings)) return null
  if (x.cards !== undefined && !isObj(x.cards)) return null
  const rev = typeof x.rev === 'number' && Number.isFinite(x.rev) && x.rev >= 0 ? x.rev : 0
  return { raw, rev }
}

export type Decision =
  /** start from localStorage as it is; `writeDurable`: the durable copy is missing, older or damaged */
  | { use: 'local'; raw: string; writeDurable: boolean }
  /** localStorage is empty, damaged or older: start from the durable copy (and put it back into localStorage) */
  | { use: 'durable'; raw: string; writeDurable: false }
  /** nothing saved anywhere: a first launch */
  | { use: 'none'; raw: null; writeDurable: false }

/** The durable copy to trust among the slots: the valid one with the highest save counter (first on a tie). */
export function bestDurable(slots: (string | null)[]): { copy: Copy; slot: number } | null {
  let best: { copy: Copy; slot: number } | null = null
  slots.forEach((raw, slot) => {
    const copy = parseCopy(raw)
    if (copy && (!best || copy.rev > best.copy.rev)) best = { copy, slot }
  })
  return best
}

/**
 * Which copy the app starts from. The save counter decides, never a clock: a device clock that was moved
 * (or a backup made on a device whose clock ran ahead) must not make an older copy look newer.
 * - only one usable copy: that one (a damaged copy counts as none);
 * - both: the higher counter; on a tie localStorage, the copy the app was last running from.
 */
export function reconcile(localRaw: string | null, durableSlots: (string | null)[]): Decision {
  const local = parseCopy(localRaw)
  const durable = bestDurable(durableSlots)?.copy ?? null
  if (!local && !durable) return { use: 'none', raw: null, writeDurable: false }
  if (!durable) return { use: 'local', raw: local!.raw, writeDurable: true }
  if (!local || durable.rev > local.rev) return { use: 'durable', raw: durable.raw, writeDurable: false }
  return { use: 'local', raw: local.raw, writeDurable: local.rev > durable.rev || local.raw !== durable.raw }
}

// ── the files ──

/** The few file operations the durable store needs (Capacitor Filesystem in the app, a Map in tests). */
export interface FileAdapter {
  /** the file's text, or null when it does not exist or cannot be read */
  read(name: string): Promise<string | null>
  write(name: string, data: string): Promise<void>
  remove(name: string): Promise<void>
}

export const SLOTS = ['state-a.json', 'state-b.json'] as const

/**
 * Write-through mirror of the store. `schedule` is called on every save and coalesces bursts (answering
 * cards quickly) into one write after `delayMs`; `flush` writes at once (the app going to the background).
 * Writes never overlap, and each goes to the slot that does not hold the newest good copy.
 */
export class DurableStore {
  private next = 0
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null
  /** the last write's error, for diagnostics; cleared by a successful write */
  lastError: unknown = null

  constructor(
    private fs: FileAdapter,
    private delayMs = 400,
  ) {}

  /** Read both slots; the next write goes to the slot that does not hold the best copy. */
  async readSlots(): Promise<(string | null)[]> {
    const slots = await Promise.all(SLOTS.map((n) => this.fs.read(n).catch(() => null)))
    const best = bestDurable(slots)
    this.next = best ? (best.slot + 1) % SLOTS.length : 0
    return slots
  }

  schedule(raw: string) {
    this.pending = raw
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.drain()
    }, this.delayMs)
  }

  /** Write what is pending now and wait for it (and for a write already under way). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.drain()
  }

  private drain(): Promise<void> {
    if (this.running) return this.running.then(() => (this.pending !== null ? this.drain() : undefined))
    if (this.pending === null) return Promise.resolve()
    const raw = this.pending
    this.pending = null
    const slot = this.next
    this.running = this.fs
      .write(SLOTS[slot], raw)
      .then(
        () => {
          this.next = (slot + 1) % SLOTS.length
          this.lastError = null
        },
        (e) => {
          // keep the newest text for the next attempt unless a newer save has replaced it
          if (this.pending === null) this.pending = raw
          this.lastError = e
        },
      )
      .finally(() => {
        this.running = null
      })
    return this.running
  }

  /** Remove both slots (reset). Pending text is dropped; the store's next save writes a fresh copy. */
  async clear(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
    if (this.running) await this.running
    await Promise.all(SLOTS.map((n) => this.fs.remove(n).catch(() => {})))
    this.next = 0
  }
}
