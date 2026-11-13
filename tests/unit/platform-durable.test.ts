import { describe, expect, it } from 'vitest'
import { bestDurable, DurableStore, parseCopy, reconcile, SLOTS, type FileAdapter } from '../../src/platform/durable'
import { boot, KEY } from './helpers'

const st = (rev: number | undefined, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 3, onboarded: true, settings: { target: 5 }, cards: {}, log: {}, marks: [], xp: 0, ...(rev === undefined ? {} : { rev }), ...extra })

/** In-memory files; `failWrites` makes writes reject, `torn` cuts the next write short (a crash mid-write). */
class MemFiles implements FileAdapter {
  files = new Map<string, string>()
  writes: string[] = []
  failWrites = false
  torn = false
  async read(name: string) {
    return this.files.get(name) ?? null
  }
  async write(name: string, data: string) {
    this.writes.push(name)
    if (this.failWrites) throw new Error('disk full')
    if (this.torn) {
      this.torn = false
      this.files.set(name, data.slice(0, Math.floor(data.length / 2)))
      throw new Error('killed')
    }
    this.files.set(name, data)
  }
  async remove(name: string) {
    this.files.delete(name)
  }
}

describe('parseCopy', () => {
  it('reads the save counter, 0 when absent or nonsense', () => {
    expect(parseCopy(st(7))?.rev).toBe(7)
    expect(parseCopy(st(undefined))?.rev).toBe(0)
    expect(parseCopy(st(-3))?.rev).toBe(0)
    expect(parseCopy(JSON.stringify({ settings: {}, rev: 'x' }))?.rev).toBe(0)
  })
  it('refuses what the store could not load', () => {
    for (const bad of [null, undefined, '', 'not json', '{"v":3', 'null', '[]', '{"settings":null}', '{"settings":{},"cards":[]}']) expect(parseCopy(bad)).toBeNull()
  })
})

describe('reconcile: which copy the app starts from', () => {
  it('both empty: a first launch, nothing to write', () => {
    expect(reconcile(null, [null, null])).toEqual({ use: 'none', raw: null, writeDurable: false })
  })

  it('first launch of this version with existing localStorage (no counter yet): keep it and create the durable copy', () => {
    const local = st(undefined, { xp: 40 })
    expect(reconcile(local, [null, null])).toEqual({ use: 'local', raw: local, writeDurable: true })
  })

  it('localStorage evicted by iOS: restore from the durable copy', () => {
    const d = st(12, { xp: 120 })
    expect(reconcile(null, [d, null])).toEqual({ use: 'durable', raw: d, writeDurable: false })
  })

  it('localStorage older than the durable copy: the durable copy wins', () => {
    const d = st(12, { xp: 120 })
    expect(reconcile(st(9, { xp: 90 }), [null, d])).toEqual({ use: 'durable', raw: d, writeDurable: false })
  })

  it('durable copy behind (the app was killed before the mirror write): localStorage wins and is written', () => {
    const local = st(15, { xp: 150 })
    expect(reconcile(local, [st(14), st(13)])).toEqual({ use: 'local', raw: local, writeDurable: true })
  })

  it('same counter and same text: nothing to do', () => {
    const s = st(5)
    expect(reconcile(s, [s, st(4)])).toEqual({ use: 'local', raw: s, writeDurable: false })
  })

  it('same counter, different text: localStorage (the copy the app last ran from) wins and is mirrored', () => {
    const local = st(5, { xp: 1 })
    expect(reconcile(local, [st(5, { xp: 2 }), null])).toEqual({ use: 'local', raw: local, writeDurable: true })
  })

  it('a damaged durable copy counts as none', () => {
    const local = st(3)
    expect(reconcile(local, ['{"v":3,"onboa', 'garbage'])).toEqual({ use: 'local', raw: local, writeDurable: true })
    expect(reconcile(null, ['{"v":3,"onboa', null])).toEqual({ use: 'none', raw: null, writeDurable: false })
  })

  it('one damaged slot (a write cut short): the other slot is used', () => {
    const good = st(20, { xp: 200 })
    expect(reconcile(null, [good, good.slice(0, 30)])).toEqual({ use: 'durable', raw: good, writeDurable: false })
    expect(bestDurable([good.slice(0, 30), good])?.slot).toBe(1)
  })

  it('damaged localStorage and a good durable copy: the durable copy', () => {
    const d = st(2)
    expect(reconcile('{"broken', [d, null]).use).toBe('durable')
  })

  it('clock skew: the counter decides, not timestamps inside the state', () => {
    // the durable copy was saved later (higher counter) on a device whose clock had been moved back a year
    const durable = st(31, { xp: 310, log: { '2025-11-13': { c: 5, n: 0, r: 0, p: 0 } }, cards: { '5-0': { due: Date.parse('2025-11-20'), state: 2 } } })
    const local = st(30, { xp: 300, log: { '2026-11-13': { c: 1, n: 0, r: 0, p: 0 } }, cards: { '5-0': { due: Date.parse('2026-12-01'), state: 2 } } })
    expect(reconcile(local, [durable, null]).use).toBe('durable')
    // …and the other way round: a lower counter never wins with "newer" dates
    expect(reconcile(durable.replace('"rev":31', '"rev":29'), [local, null]).use).toBe('durable')
  })
})

describe('DurableStore: write-through mirror', () => {
  it('coalesces a burst of saves into one write and alternates slots', async () => {
    const fs = new MemFiles()
    const d = new DurableStore(fs, 50)
    await d.readSlots()
    d.schedule(st(1))
    d.schedule(st(2))
    d.schedule(st(3))
    await d.flush()
    expect(fs.writes).toEqual([SLOTS[0]])
    expect(fs.files.get(SLOTS[0])).toBe(st(3))
    d.schedule(st(4))
    await d.flush()
    expect(fs.writes).toEqual([SLOTS[0], SLOTS[1]])
    expect(reconcile(null, [fs.files.get(SLOTS[0])!, fs.files.get(SLOTS[1])!])).toMatchObject({ use: 'durable', raw: st(4) })
  })

  it('never overwrites the slot holding the newest good copy first', async () => {
    const fs = new MemFiles()
    fs.files.set(SLOTS[0], st(9))
    fs.files.set(SLOTS[1], st(4))
    const d = new DurableStore(fs, 0)
    await d.readSlots()
    d.schedule(st(10))
    await d.flush()
    expect(fs.writes).toEqual([SLOTS[1]])
  })

  it('a write killed half-way leaves the previous save readable in the other slot', async () => {
    const fs = new MemFiles()
    const d = new DurableStore(fs, 0)
    await d.readSlots()
    d.schedule(st(1, { xp: 10 }))
    await d.flush()
    fs.torn = true
    d.schedule(st(2, { xp: 20 }))
    await d.flush()
    const slots = SLOTS.map((n) => fs.files.get(n) ?? null)
    expect(reconcile(null, slots)).toMatchObject({ use: 'durable', raw: st(1, { xp: 10 }) })
    expect(d.lastError).toBeTruthy()
    // the text is kept and written on the next attempt
    await d.flush()
    expect(reconcile(null, SLOTS.map((n) => fs.files.get(n) ?? null))).toMatchObject({ raw: st(2, { xp: 20 }) })
  })

  it('clear removes both slots and drops pending text', async () => {
    const fs = new MemFiles()
    const d = new DurableStore(fs, 1000)
    await d.readSlots()
    d.schedule(st(1))
    await d.flush()
    d.schedule(st(2))
    d.schedule(st(3))
    await d.clear()
    await d.flush()
    expect(fs.files.size).toBe(0)
  })
})

describe('store: save counter, hooks and hydrate', () => {
  it('every change counts up from the current copy, including an import that brings its own counter', async () => {
    const { store, ls } = await boot({ now: '2026-11-13T09:00:00', saved: JSON.parse(st(41)) })
    store.update((d) => void (d.xp = 1))
    expect(store.getState().rev).toBe(42)
    store.replaceState({ ...JSON.parse(st(999)), v: 3 } as never)
    expect(store.getState().rev).toBe(43)
    expect(JSON.parse(ls.getItem(KEY)!).rev).toBe(43)
  })

  it('a state saved before the counter existed starts at 1 on its next save', async () => {
    const { store } = await boot({ now: '2026-11-13T09:00:00', saved: JSON.parse(st(undefined)) })
    store.update((d) => void (d.xp = 5))
    expect(store.getState().rev).toBe(1)
  })

  it('onSave sees every save even when localStorage refuses it; onReset follows a reset', async () => {
    const { store, ls } = await boot({ now: '2026-11-13T09:00:00' })
    const saves: string[] = []
    let resets = 0
    store.setStoreHooks({ onSave: (r) => saves.push(r), onReset: () => resets++ })
    store.update((d) => void (d.xp = 3))
    ls.quota = 10
    store.update((d) => void (d.xp = 4))
    expect(store.getSaveStatus().failed).toBe(true)
    expect(saves.map((r) => JSON.parse(r).xp)).toEqual([3, 4])
    store.resetAll()
    expect(resets).toBe(1)
    expect(JSON.parse(saves.at(-1)!).xp).toBe(0)
  })

  it('hydrate takes a durable copy before the first render, and refuses garbage', async () => {
    const { store, ls } = await boot({ now: '2026-11-13T09:00:00' })
    expect(store.getState().onboarded).toBe(false)
    expect(store.hydrate('not json')).toBe(false)
    expect(store.hydrate('{"settings":null}')).toBe(false)
    expect(store.getState().onboarded).toBe(false)
    expect(store.hydrate(st(12, { xp: 120 }))).toBe(true)
    expect(store.getState()).toMatchObject({ onboarded: true, xp: 120, rev: 12 })
    expect(JSON.parse(ls.getItem(KEY)!).xp).toBe(120)
  })

  it('hydrate still starts from the copy when localStorage is full', async () => {
    const { store, ls } = await boot({ now: '2026-11-13T09:00:00' })
    ls.quota = 5
    expect(store.hydrate(st(12, { xp: 120 }))).toBe(true)
    expect(store.getState().xp).toBe(120)
    expect(ls.getItem(KEY)).toBeNull()
  })

  it('backups do not carry the save counter', async () => {
    const { store } = await boot({ now: '2026-11-13T09:00:00' })
    store.update((d) => void (d.xp = 3))
    const backup = await import('../../src/backup')
    expect(backup.backupFile(store.getState())).not.toHaveProperty('rev')
  })
})
