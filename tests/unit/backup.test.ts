import { describe, expect, it, vi } from 'vitest'
import { boot, card, DAY, KEY, MemoryStorage } from './helpers'

const NOW = '2026-11-13T09:00:00'

async function bootBackup(opts: Parameters<typeof boot>[0] = { now: NOW }) {
  const b = await boot(opts)
  const backup = await import('../../src/backup')
  return { ...b, backup }
}

const manyCards = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`5-${i}`, card({ due: Date.parse(NOW) + DAY })]))

describe('store: save failure status', () => {
  it('reports a failed save once, stays quiet after dismissal, and resets after a successful save', async () => {
    const storage = new MemoryStorage()
    const { store } = await boot({ now: NOW, storage })
    expect(store.getSaveStatus()).toEqual({ failed: false, dismissed: false })

    storage.quota = 10 // nothing fits any more
    store.update((d) => void (d.xp = 1))
    expect(store.getSaveStatus()).toEqual({ failed: true, dismissed: false })

    store.dismissSaveWarning()
    store.update((d) => void (d.xp = 2))
    expect(store.getSaveStatus()).toEqual({ failed: true, dismissed: true }) // no new warning for the same run of failures

    storage.quota = Infinity
    store.update((d) => void (d.xp = 3))
    expect(store.getSaveStatus()).toEqual({ failed: false, dismissed: false })
    expect(JSON.parse(storage.getItem(KEY)!).xp).toBe(3)

    storage.quota = 10
    store.update((d) => void (d.xp = 4))
    expect(store.getSaveStatus()).toEqual({ failed: true, dismissed: false }) // a new failure is reported again
  })

  it('a save rescued by dropping the AI cache is not a failure', async () => {
    const storage = new MemoryStorage()
    storage.setItem('kasane.ai.5-0', 'x'.repeat(2000))
    const { store } = await boot({ now: NOW, storage })
    storage.quota = 1500
    store.update((d) => void (d.xp = 1))
    expect(store.getSaveStatus().failed).toBe(false)
    expect(storage.getItem('kasane.ai.5-0')).toBeNull()
  })
})

describe('store: import with undo', () => {
  it('keeps the previous state under its own key and restores it on undo', async () => {
    const { store, ls } = await boot({ now: NOW })
    store.update((d) => {
      d.onboarded = true
      d.xp = 5
      d.marks = ['5-1']
    })
    expect(store.canUndoImport()).toBe(false)
    expect(store.undoImport()).toBe(false)

    store.importState({ ...store.getState(), xp: 999, marks: [] })
    expect(store.getState().xp).toBe(999)
    expect(JSON.parse(ls.getItem(store.PREV_KEY)!).xp).toBe(5)
    expect(store.canUndoImport()).toBe(true)

    expect(store.undoImport()).toBe(true)
    expect(store.getState().xp).toBe(5)
    expect(store.getState().marks).toEqual(['5-1'])
    expect(JSON.parse(ls.getItem(KEY)!).xp).toBe(5)
    expect(ls.getItem(store.PREV_KEY)).toBeNull()
    expect(store.canUndoImport()).toBe(false)
  })

  it('undo still works in the session when the copy cannot be written to storage', async () => {
    const storage = new MemoryStorage()
    const { store } = await boot({ now: NOW, storage })
    store.update((d) => void (d.xp = 7))
    const original = storage.setItem.bind(storage)
    storage.setItem = (k: string, v: string) => {
      if (k === 'kasane.state.prev') throw new DOMException('quota', 'QuotaExceededError')
      original(k, v)
    }
    store.importState({ ...store.getState(), xp: 1 })
    expect(store.undoImport()).toBe(true)
    expect(store.getState().xp).toBe(7)
  })
})

describe('backup file format', () => {
  it('adds format fields next to `v` and leaves out the API key', async () => {
    const { store, backup } = await bootBackup()
    store.update((d) => {
      d.settings.apiKey = 'sk-ant-secret'
      d.xp = 40
    })
    const file = backup.backupFile(store.getState(), new Date(NOW))
    expect(file).toMatchObject({ format: 'jlpt-luma-backup', formatVersion: 1, v: 2, xp: 40, exportedAt: new Date(NOW).toISOString() })
    expect(file.app).toMatch(/^kasane /)
    expect(file.settings.apiKey).toBe('')
  })

  it('reads its own files, minus the format fields', async () => {
    const { store, backup } = await bootBackup()
    store.update((d) => void (d.xp = 12))
    const file = JSON.parse(JSON.stringify(backup.backupFile(store.getState())))
    const r = backup.readBackup(file)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.xp).toBe(12)
    for (const k of ['format', 'formatVersion', 'app', 'exportedAt']) expect(r.state).not.toHaveProperty(k)
  })

  it('still reads backups made before the format fields existed', async () => {
    const { backup } = await bootBackup()
    const old = { v: 2, onboarded: true, settings: { target: 4 }, cards: { '4-0': card({ due: 0 }) }, log: {}, marks: [], xp: 3 }
    const r = backup.readBackup(old)
    expect(r.ok && r.state.xp).toBe(3)
  })

  it('rejects other formats, newer format versions and broken states', async () => {
    const { backup } = await bootBackup()
    const state = { v: 2, onboarded: true, settings: {}, cards: {}, log: {} }
    expect(backup.readBackup({ ...state, format: 'something-else', formatVersion: 1 })).toEqual({ ok: false, reason: 'invalid' })
    expect(backup.readBackup({ ...state, format: 'jlpt-luma-backup' })).toEqual({ ok: false, reason: 'invalid' })
    expect(backup.readBackup({ ...state, format: 'jlpt-luma-backup', formatVersion: 2 })).toEqual({ ok: false, reason: 'newer' })
    expect(backup.readBackup({ ...state, format: 'jlpt-luma-backup', formatVersion: 1, cards: { '5-0': null } })).toEqual({ ok: false, reason: 'invalid' })
    for (const bad of [null, [], 'x', 3]) expect(backup.readBackup(bad).ok).toBe(false)
  })
})

describe('backup reminder', () => {
  it('needs real progress and no export in the last week', async () => {
    const { store, backup } = await bootBackup()
    const today = new Date(NOW)
    expect(backup.shouldNudge(store.getState(), {}, today)).toBe(false) // nothing to lose yet
    store.update((d) => void (d.cards = manyCards(29)))
    expect(backup.shouldNudge(store.getState(), {}, today)).toBe(false)
    store.update((d) => void (d.cards = manyCards(30)))
    const s = store.getState()
    expect(backup.shouldNudge(s, {}, today)).toBe(true)
    expect(backup.shouldNudge(s, { lastExport: '2026-11-07' }, today)).toBe(false) // 6 days ago
    expect(backup.shouldNudge(s, { lastExport: '2026-11-06' }, today)).toBe(true) // 7 days ago
  })

  it('closing it snoozes it for a week and is remembered on this device', async () => {
    const { store, backup, ls } = await bootBackup()
    store.update((d) => void (d.cards = manyCards(30)))
    backup.snoozeNudge(new Date(NOW))
    expect(backup.getMeta().nudgeAfter).toBe('2026-11-20')
    expect(JSON.parse(ls.getItem(backup.META_KEY)!).nudgeAfter).toBe('2026-11-20')
    const s = store.getState()
    expect(backup.shouldNudge(s, backup.getMeta(), new Date('2026-11-19T09:00:00'))).toBe(false)
    expect(backup.shouldNudge(s, backup.getMeta(), new Date('2026-11-20T09:00:00'))).toBe(true)
  })

  it('reminder notes are not part of the study state', async () => {
    const { store, backup, ls } = await bootBackup()
    backup.setMeta({ lastExport: '2026-11-13' })
    expect(store.getState()).not.toHaveProperty('lastExport')
    expect(ls.getItem(KEY)).toBeNull()
  })
})

describe('persistent storage', () => {
  it('is requested once', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('navigator', { storage: { persist } })
    const { backup } = await bootBackup()
    backup.requestPersist()
    backup.requestPersist()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(backup.getMeta().persistAsked).toBe(true)
  })

  it('does nothing where the Storage API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const { backup } = await bootBackup()
    expect(() => backup.requestPersist()).not.toThrow()
  })
})
