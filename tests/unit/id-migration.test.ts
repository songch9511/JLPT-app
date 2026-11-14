// Stable word ids: the one-time migration of every learner's records (docs/plan/08-word-data.md §7.3–7.5).
// The fixtures in tests/fixtures/legacy were written by the app's own code at commit 5fd69b4, the last version
// with positional ids (generate-at-5fd69b4.ts): a learner who studied N5–N1 for three months with the fast-track on
// and stopped part-way through today's session (3,183 cards incl. 1,278 reading cards, 73 bookmarks), and backups of
// every older format.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boot, KEY, L, LEGACY_KEY, MemoryStorage } from './helpers'
import type { SCard, State } from '../../src/store'

const NOW = '2026-11-13T09:00:00'
const fixture = (name: string) => readFileSync(new URL(`../fixtures/legacy/${name}`, import.meta.url), 'utf8')
const json = (path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

/** headword|reading of every positional id, from the frozen files that version read */
const LEGACY_WORD = new Map<string, string>()
for (const l of [1, 2, 3, 4, 5]) (json(`public/data/n${l}.json`) as string[][]).forEach(([w, r], i) => LEGACY_WORD.set(`${l}-${i}`, `N${l} ${w}|${r}`))
/** headword|reading of every stable id, from the files this version reads */
const WORD = new Map<string, string>()
for (const l of [1, 2, 3, 4, 5]) (json(`public/data/words-n${l}.json`) as string[][]).forEach(([id, w, r]) => WORD.set(id, `N${l} ${w}|${r}`))
const split = (id: string) => {
  const i = id.indexOf(':')
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i)]
}
/** what a card id points at: word + card type */
const legacyTarget = (id: string) => LEGACY_WORD.get(split(id)[0]) + split(id)[1]
const target = (id: string) => WORD.get(split(id)[0]) + split(id)[1]

type Legacy = Omit<State, 'v'> & { v: 2 | 3 }

/** Every card of `old` is in `s` under the stable id of the same word and card type, byte for byte, in the same order. */
function expectSameRecords(old: Legacy, s: State) {
  const oldIds = Object.keys(old.cards)
  const ids = Object.keys(s.cards)
  expect(ids).toHaveLength(oldIds.length)
  oldIds.forEach((oldId, i) => {
    expect(target(ids[i])).toBe(legacyTarget(oldId))
    expect(JSON.stringify(s.cards[ids[i]])).toBe(JSON.stringify(old.cards[oldId]))
  })
  expect(s.marks.map(target)).toEqual((old.marks ?? []).map(legacyTarget))
  expect(s.log).toEqual(old.log)
  expect(s.xp).toBe(old.xp)
  expect(s.orphans).toBeUndefined()
}

afterEach(() => {
  vi.doUnmock('../../src/ids')
})

describe('migrating a real learner’s saved state (v3, positional ids)', () => {
  const raw = fixture('state-v3.json')
  const old = JSON.parse(raw) as Legacy

  it('every card still points at the same headword+reading, FSRS fields byte-identical; bookmarks, log, settings as they were', async () => {
    expect(Object.keys(old.cards).length).toBeGreaterThan(3000)
    const { store, ls } = await boot({ now: NOW, legacy: raw })
    const s = store.getState()
    expect(s.v).toBe(4)
    expectSameRecords(old, s)
    expect(s.settings).toEqual(old.settings)
    expect(s.onboarded).toBe(true)
    expect(s.bestE).toBe(old.bestE)
    // the save counter carries on from the old copy (the iOS durable copy is compared by it)
    expect(s.rev).toBe(old.rev)
    // stored at once under the new key; the old copy is left exactly as it was (the recoverable pre-migration copy)
    expect(JSON.parse(ls.getItem(KEY)!)).toEqual(s)
    expect(ls.getItem(LEGACY_KEY)).toBe(raw)
  })

  it('is idempotent: migrating the migrated state, or loading it again, changes nothing', async () => {
    const { store, ls } = await boot({ now: NOW, legacy: raw })
    const s = store.getState()
    expect(store.migrate(s as never)).toEqual(s)
    const again = await boot({ now: NOW, storage: ls })
    expect(again.store.getState()).toEqual(s)
    expect(ls.getItem(KEY)).toBe(JSON.stringify(s))
  })

  it('mid-session: today’s queue continues with the same cards (learning cards still pending, the day’s counts kept)', async () => {
    const { store, srs } = await boot({ now: NOW, legacy: raw })
    const s = store.getState()
    const q = srs.buildQueue(s, new Date(NOW))
    // the learning cards the learner left today are today's learning cards now, by word
    const pending = Object.entries(old.cards).filter(([, c]) => c.state !== 2 && c.due < Date.parse('2026-11-14T00:00:00')).map(([id]) => legacyTarget(id))
    expect(q.learning).toBe(pending.length)
    expect(pending.length).toBeGreaterThan(0)
    expect(s.log['2026-11-13']).toEqual(old.log['2026-11-13'])
    expect(target(q.next!.id)).toBe(legacyTarget(Object.keys(old.cards)[Object.keys(s.cards).indexOf(q.next!.id)]))
  })

  it('drops caches keyed by positional ids (kasane.ai.*) and keeps device notes (kasane.meta)', async () => {
    const storage = new MemoryStorage()
    storage.setItem('kasane.ai.5-0', '{"tip":"x"}')
    storage.setItem('kasane.meta', '{"lastExport":"2026-11-01"}')
    await boot({ now: NOW, legacy: raw, storage })
    expect(storage.getItem('kasane.ai.5-0')).toBeNull()
    expect(storage.getItem('kasane.meta')).toBe('{"lastExport":"2026-11-01"}')
  })
})

describe('a full state: every word and every reading card', () => {
  // 8,130 meaning cards and a reading card for each of the 3,489 S words, with a year of logs: the largest state a
  // learner can have
  function fullState(): Legacy {
    const cards: Record<string, SCard> = {}
    let k = 0
    for (const l of [5, 4, 3, 2, 1])
      (json(`public/data/n${l}.json`) as unknown[][]).forEach((row, i) => {
        const c = (n: number): SCard => ({
          due: 1763000000000 + n * 7919,
          stability: 1 + (n % 97) * 1.2345678901234567,
          difficulty: 1 + (n % 9) * 0.987654321,
          elapsed_days: n % 30,
          scheduled_days: n % 60,
          learning_steps: 0,
          reps: 1 + (n % 12),
          lapses: n % 4,
          state: 2,
          last_review: 1762000000000 + n * 6007,
        })
        cards[`${l}-${i}`] = c(k++)
        if (row[6] === 'S') cards[`${l}-${i}:r`] = c(k++)
      })
    const log: State['log'] = {}
    for (let d = 0; d < 365; d++) log[`2025-${String(1 + Math.floor(d / 31) % 12).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`] = { c: 80, n: 20, r: 50, p: 45, ms: 640000, e: 44.5, xp: 800 }
    return { v: 3, onboarded: true, settings: { target: 1, examDate: '2026-12-06', dailyNew: 20, theme: 'system', autoSpeak: false, includeLower: true, goal: 0.8, fastTrack: true }, cards, log, marks: Object.keys(cards).filter((id) => !id.includes(':')).slice(0, 500), xp: 99999, rev: 40000 }
  }

  it('migrates all 11,619 cards to the same words, and measures time and size', async () => {
    const old = fullState()
    const raw = JSON.stringify(old)
    expect(Object.keys(old.cards)).toHaveLength(8130 + 3489)
    const { store, ls } = await boot({ now: NOW })
    // time the migration itself (the 4x-throttled browser figure is measured in the e2e run, docs/plan/08 §7.7)
    const t0 = performance.now()
    const s = store.migrate(JSON.parse(raw))
    const ms = performance.now() - t0
    expectSameRecords(old, s)
    const after = JSON.stringify(s)
    console.log(`full state: ${Object.keys(s.cards).length} cards, ${raw.length} → ${after.length} chars (${((after.length / raw.length - 1) * 100).toFixed(1)}%), migrate ${ms.toFixed(1)} ms (+ parse)`)
    expect(after.length).toBeLessThan(raw.length)
    expect(ms).toBeLessThan(500)
    // and through storage: the load path, as the app does it
    const b = await boot({ now: NOW, legacy: raw, storage: new MemoryStorage() })
    expectSameRecords(old, b.store.getState())
    expect(ls).toBeDefined()
  })
})

describe('crash safety', () => {
  const raw = fixture('state-v3.json')
  const old = JSON.parse(raw) as Legacy

  it('the migrated state cannot be stored at all: runs from memory with the save warning, the old copy untouched (even when it was moved aside to make room), migrated again next launch', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_KEY, raw)
    const setItem = storage.setItem.bind(storage)
    let broken = true
    storage.setItem = (k: string, v: string) => {
      if (broken && k === KEY) throw new DOMException('quota', 'QuotaExceededError')
      setItem(k, v)
    }
    const { store } = await boot({ now: NOW, storage })
    expectSameRecords(old, store.getState())
    expect(storage.getItem(KEY)).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBe(raw)
    expect(store.getSaveStatus().failed).toBe(true)
    broken = false
    const again = await boot({ now: NOW, storage })
    expectSameRecords(old, again.store.getState())
    expect(storage.getItem(KEY)).not.toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBe(raw)
  })

  it('room for only one copy: the pre-migration copy is given up for the migrated state (same records), after the import-undo copy', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_KEY, raw)
    storage.setItem('kasane.state.prev', raw)
    storage.quota = 2 * raw.length + 40 // both old copies fit, a third copy does not
    const { store } = await boot({ now: NOW, storage })
    expect(store.getSaveStatus().failed).toBe(false)
    expect(storage.getItem('kasane.state.prev')).toBeNull()
    // the import-undo copy was enough room here: the pre-migration copy stays
    expect(storage.getItem(LEGACY_KEY)).toBe(raw)
    expectSameRecords(old, JSON.parse(storage.getItem(KEY)!))
    const tight = new MemoryStorage()
    tight.setItem(LEGACY_KEY, raw)
    tight.quota = raw.length + 40
    const b = await boot({ now: NOW, storage: tight })
    expect(b.store.getSaveStatus().failed).toBe(false)
    expect(tight.getItem(LEGACY_KEY)).toBeNull()
    expectSameRecords(old, JSON.parse(tight.getItem(KEY)!))
  })

  it('a migration that throws: nothing is written, the app shows the recovery screen, and the next launch tries again', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_KEY, raw)
    vi.doMock('../../src/ids', async (orig) => ({ ...(await orig<typeof import('../../src/ids')>()), fromLegacy: () => { throw new Error('boom') } }))
    const { store } = await boot({ now: NOW, storage })
    expect(store.getLoadError()?.message).toBe('boom')
    store.update((d) => void (d.xp = 1))
    expect(storage.getItem(KEY)).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBe(raw)
    vi.doUnmock('../../src/ids')
    const again = await boot({ now: NOW, storage })
    expect(again.store.getLoadError()).toBeNull()
    expectSameRecords(old, again.store.getState())
  })

  it('a damaged migrated state next to the old copy: migrated again from the old copy rather than starting empty', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_KEY, raw)
    storage.setItem(KEY, '{"v":4,"cards":')
    const { store } = await boot({ now: NOW, storage })
    expectSameRecords(old, store.getState())
  })
})

describe('quarantine: ids this version does not know are kept apart, never dropped', () => {
  it('positional ids that never named a word, and malformed ones, go to `orphans` unchanged and are counted', async () => {
    const c = (due: number): SCard => ({ due, stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: due - 1 })
    const legacy = { v: 3, onboarded: true, settings: { target: 5 }, cards: { '5-0': c(1), '5-718': c(2), '9-1': c(3), banana: c(4), '5-1:x': c(5) }, log: {}, marks: ['5-0', '5-9999'], xp: 0 }
    const { store } = await boot({ now: NOW, legacy })
    const s = store.getState()
    expect(s.cards).toEqual({ [L('5-0')]: c(1) })
    expect(s.marks).toEqual([L('5-0')])
    expect(s.orphans).toEqual({ cards: { '5-718': c(2), '9-1': c(3), banana: c(4), '5-1:x': c(5) }, marks: ['5-9999'] })
    expect(store.orphanCount(s)).toBe(5)
    // they are exported and come back with an import
    const backup = await import('../../src/backup')
    const r = backup.readBackup(JSON.parse(JSON.stringify(backup.backupFile(s))))
    expect(r.ok && r.state.orphans).toEqual(s.orphans)
    // the screens never see them
    const srs = await import('../../src/srs')
    expect(srs.breakdowns(s)[5].new).toBe(717)
  })

  it('a stable id this version does not know (a newer word list) is quarantined; one it knows comes back', async () => {
    const c = { due: 1, stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2 }
    const saved = { v: 4, onboarded: true, settings: { target: 5 }, cards: { wzzzz: c }, log: {}, marks: [], xp: 0, orphans: { cards: { [L('5-3')]: c }, marks: [L('5-4')] } }
    const { store } = await boot({ now: NOW, saved })
    const s = store.getState()
    expect(s.cards).toEqual({ [L('5-3')]: c })
    expect(s.marks).toEqual([L('5-4')])
    expect(s.orphans).toEqual({ cards: { wzzzz: c }, marks: [] })
  })

  it('a word with both a positional and a stable card keeps the later learning; the other is kept apart', async () => {
    const early = { due: 1, stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: 100 }
    const late = { ...early, last_review: 200 }
    const { store } = await boot({ now: NOW })
    const s = store.migrate({ v: 4, onboarded: true, settings: { target: 5 }, cards: { [L('5-3')]: early, '5-3': late }, log: {}, marks: [], xp: 0 } as never)
    expect(s.cards).toEqual({ [L('5-3')]: late })
    expect(s.orphans?.cards).toEqual({ [L('5-3')]: early })
  })
})

describe('a tab still running the version before stable ids', () => {
  const raw = fixture('state-v3.json')
  const old = JSON.parse(raw) as Legacy
  /** the browser's `storage` event, as another tab's write delivers it */
  const storageEvent = (key: string) => Object.assign(new Event('storage'), { key })

  async function twoTabs() {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const b = await boot({ now: NOW, legacy: raw })
    return { ...b, win }
  }

  it('cannot see or overwrite the migrated state: it only ever writes the old key', async () => {
    const { ls } = await twoTabs()
    const migrated = ls.getItem(KEY)
    // the old tab saves its (old) state again: only LEGACY_KEY changes
    ls.setItem(LEGACY_KEY, JSON.stringify({ ...old, xp: old.xp + 10, rev: old.rev! + 1 }))
    expect(ls.getItem(KEY)).toBe(migrated)
  })

  it('its later saves are merged in card by card: newer learning taken, nothing newer here rolled back, merging twice is a no-op', async () => {
    const { store, srs, ls, win } = await twoTabs()
    // this tab answers a card after the migration
    const mine = Object.keys(store.getState().cards)[0]
    srs.answer(mine, srs.Rating.Good, new Date('2026-11-13T09:05:00'))
    const mineAfter = store.getState().cards[mine]
    const xpHere = store.getState().xp
    // the old tab, from its stale copy: introduces a new word, answers an existing card later, and still holds
    // the stale version of `mine`
    const oldIds = Object.keys(old.cards)
    const later = { ...old.cards[oldIds[5]], reps: 99, last_review: Date.parse('2026-11-13T09:10:00') }
    const fresh = { ...old.cards[oldIds[6]], reps: 1, last_review: Date.parse('2026-11-13T09:11:00') }
    const freshId = '1-2000'
    expect(old.cards[freshId]).toBeUndefined()
    const oldWrite = { ...old, cards: { ...old.cards, [oldIds[5]]: later, [freshId]: fresh }, marks: [...old.marks, '1-2000'], xp: old.xp + 20, rev: old.rev! + 2 }
    ls.setItem(LEGACY_KEY, JSON.stringify(oldWrite))
    win.dispatchEvent(storageEvent(LEGACY_KEY))
    const s = store.getState()
    expect(s.cards[mine]).toEqual(mineAfter)
    expect(s.cards[L(oldIds[5])]).toEqual(later)
    expect(s.cards[L(freshId)]).toEqual(fresh)
    expect(s.marks).toContain(L('1-2000'))
    expect(s.xp).toBe(Math.max(old.xp + 20, xpHere))
    expect(JSON.parse(ls.getItem(KEY)!).cards[L(freshId)]).toEqual(fresh)
    // the same write again (or the event twice) changes nothing
    const rev = store.getState().rev
    win.dispatchEvent(storageEvent(LEGACY_KEY))
    expect(store.getState().rev).toBe(rev)
    // and a later launch does not merge it a second time either
    const next = await boot({ now: NOW, storage: ls })
    expect(next.store.getState()).toEqual(store.getState())
  })

  it('an old-tab save made while no new tab was open is merged at the next launch', async () => {
    const { store, ls } = await boot({ now: NOW, legacy: raw })
    const id = Object.keys(old.cards)[9]
    const later = { ...old.cards[id], reps: 77, last_review: Date.parse('2026-11-13T10:00:00') }
    ls.setItem(LEGACY_KEY, JSON.stringify({ ...old, cards: { ...old.cards, [id]: later }, rev: old.rev! + 1 }))
    const again = await boot({ now: NOW, storage: ls })
    expect(again.store.getState().cards[L(id)]).toEqual(later)
    expect(store.getState().cards[L(id)]).toEqual(old.cards[id])
  })

  it('"모든 기록 초기화" also removes the pre-migration copy, so nothing comes back', async () => {
    const { store, ls } = await boot({ now: NOW, legacy: raw })
    store.resetAll()
    expect(ls.getItem(LEGACY_KEY)).toBeNull()
    const again = await boot({ now: NOW, storage: ls })
    expect(again.store.getState().cards).toEqual({})
  })
})

describe('backups of every older format', () => {
  const cases: [string, string][] = [
    ['plain v2 state (first versions)', 'backup-plain-v2.json'],
    ['format 1 (v2 state)', 'backup-format1-v2.json'],
    ['format 2 (v3 state, reading cards)', 'backup-format2-v3.json'],
  ]
  for (const [name, file] of cases)
    it(`${name}: imports through the same migration, then round-trips as format 3`, async () => {
      const text = fixture(file)
      const old = JSON.parse(text) as Legacy & { formatVersion?: number }
      const { store } = await boot({ now: NOW })
      const backup = await import('../../src/backup')
      const r = backup.readBackup(JSON.parse(text))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expectSameRecords(old, r.state)
      expect(r.state.settings).not.toHaveProperty('apiKey')
      store.importState(r.state)
      expectSameRecords(old, store.getState())
      // export: stable ids, format 3, and the file reads back to the same state
      const out = JSON.parse(JSON.stringify(backup.backupFile(store.getState(), new Date(NOW))))
      expect(out).toMatchObject({ format: 'jlpt-luma-backup', formatVersion: 3, v: 4 })
      expect(Object.keys(out.cards).every((id) => /^w[0-9a-z]{3,}(:r)?$/.test(id))).toBe(true)
      const back = backup.readBackup(out)
      expect(back.ok).toBe(true)
      const { rev: _r, legacy: _l, ...mine } = store.getState()
      if (back.ok) expect(back.state).toEqual(mine)
      // undo goes back to what was there before the import
      expect(store.undoImport()).toBe(true)
      expect(store.getState().cards).toEqual({})
    })
})

describe('the iOS app’s durable copy', () => {
  it('a durable copy of the old version (localStorage evicted) is migrated by hydrate, and stored migrated', async () => {
    const raw = fixture('state-v3.json')
    const old = JSON.parse(raw) as Legacy
    const { store, ls } = await boot({ now: NOW })
    expect(store.hydrate(raw)).toBe(true)
    expectSameRecords(old, store.getState())
    expect(JSON.parse(ls.getItem(KEY)!).v).toBe(4)
    expect(ls.getItem(KEY)).not.toBe(raw)
  })
})

describe('word data of another deploy (service-worker update mid-session)', () => {
  it('a data file with ids this version does not know, without some of its words, or with no ids at all never changes the state', async () => {
    const raw = fixture('state-v3.json')
    const { store, srs } = await boot({ now: NOW, legacy: raw })
    const data = await import('../../src/data')
    const before = store.getState()
    const rows = json('public/data/words-n5.json') as unknown[][]
    // N5: a newer file (one word gone, an unknown id added); N4: the frozen positional file, which has no ids
    const files: Record<string, unknown> = {
      5: [...rows.slice(1), ['wzzzz', '新', 'しん', '새', 'new', 0, 50, 'K']],
      4: json('public/data/n4.json'),
    }
    vi.stubGlobal('fetch', async (url: string) => ({ ok: true, json: async () => files[/n(\d)\.json$/.exec(url)![1]] }))
    const n5 = await data.loadLevel(5)
    expect(n5).toHaveLength(717)
    expect(data.wordById('wzzzz')).toBeNull()
    expect(data.wordById(rows[0][0] as string)).toBeNull()
    expect(await data.loadLevel(4)).toEqual([])
    expect(store.getState()).toBe(before)
    // the scheduler still works on the records as they are
    expect(() => srs.buildQueue(store.getState(), new Date(NOW))).not.toThrow()
    expect(srs.breakdowns(store.getState())).toEqual(srs.breakdowns(before))
  })
})
