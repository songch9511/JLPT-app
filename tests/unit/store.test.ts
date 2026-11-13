import { describe, expect, it } from 'vitest'
import { boot, card, DAY, KEY, MemoryStorage } from './helpers'

const NOW = '2026-11-13T09:00:00'

describe('store: loading', () => {
  it('starts fresh with defaults when nothing is saved', async () => {
    const { store } = await boot({ now: NOW })
    const s = store.getState()
    expect(s.onboarded).toBe(false)
    expect(s.settings).toEqual({ target: 5, examDate: '2026-12-06', dailyNew: 20, theme: 'system', apiKey: '', autoSpeak: false })
    expect(s.cards).toEqual({})
    expect(s.marks).toEqual([])
    expect(s.xp).toBe(0)
  })

  it('the default exam date is computed from the clock at load time', async () => {
    const { store } = await boot({ now: '2026-12-07T09:00:00' })
    expect(store.getState().settings.examDate).toBe('2027-07-04')
  })

  it('fills settings added in later versions and keeps what was saved', async () => {
    const saved = {
      v: 2,
      onboarded: true,
      settings: { target: 3, examDate: '2027-07-04', dailyNew: 10, theme: 'dark' }, // no apiKey / autoSpeak
      cards: { '3-0': card({ due: Date.parse(NOW) + DAY }) },
      log: {},
      xp: 120,
      // no marks
    }
    const { store } = await boot({ now: NOW, saved })
    const s = store.getState()
    expect(s.settings).toEqual({ target: 3, examDate: '2027-07-04', dailyNew: 10, theme: 'dark', apiKey: '', autoSpeak: false })
    expect(s.marks).toEqual([])
    expect(s.xp).toBe(120)
    expect(Object.keys(s.cards)).toEqual(['3-0'])
  })

  it('falls back to a fresh state on corrupt JSON, `null`, or a missing settings object', async () => {
    for (const saved of ['{not json', 'null', JSON.stringify({ v: 2, onboarded: true })]) {
      const { store } = await boot({ now: NOW, saved })
      const s = store.getState()
      expect(s.settings.target).toBe(5)
      expect(s.cards).toEqual({})
    }
  })

  it('works when storage access itself throws (e.g. blocked site data)', async () => {
    const storage = new MemoryStorage()
    storage.failReads = true
    const { store } = await boot({ now: NOW, storage })
    expect(store.getState().onboarded).toBe(false)
    expect(() => store.update((d) => void (d.onboarded = true))).not.toThrow()
    expect(store.getState().onboarded).toBe(true)
  })
})

describe('store: saving', () => {
  it('persists every update and a fresh load reads it back', async () => {
    const { store, ls } = await boot({ now: NOW })
    store.update((d) => {
      d.onboarded = true
      d.settings.dailyNew = 30
    })
    const raw = JSON.parse(ls.getItem(KEY)!)
    expect(raw.onboarded).toBe(true)
    expect(raw.settings.dailyNew).toBe(30)
    const again = await boot({ now: NOW, storage: ls })
    expect(again.store.getState().settings.dailyNew).toBe(30)
  })

  it('updates are copy-on-write: the previous state object is untouched', async () => {
    const { store } = await boot({ now: NOW })
    const before = store.getState()
    store.update((d) => void (d.settings.target = 1))
    expect(before.settings.target).toBe(5)
    expect(store.getState()).not.toBe(before)
  })

  it('keeps working in memory when the quota is exceeded', async () => {
    const storage = new MemoryStorage()
    storage.quota = 10
    const { store } = await boot({ now: NOW, storage })
    expect(() => store.update((d) => void (d.xp = 5))).not.toThrow()
    expect(store.getState().xp).toBe(5)
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('toggleMark adds to the front and removes', async () => {
    const { store } = await boot({ now: NOW })
    store.toggleMark('5-1')
    store.toggleMark('5-2')
    expect(store.getState().marks).toEqual(['5-2', '5-1'])
    store.toggleMark('5-1')
    expect(store.getState().marks).toEqual(['5-2'])
  })

  it('resetAll returns to a fresh, not-onboarded state', async () => {
    const { store } = await boot({ now: NOW })
    store.update((d) => {
      d.onboarded = true
      d.xp = 999
      d.marks = ['5-1']
      d.cards = { '5-0': card({ due: 0 }) }
    })
    store.resetAll()
    const s = store.getState()
    expect(s.onboarded).toBe(false)
    expect(s.xp).toBe(0)
    expect(s.marks).toEqual([])
    expect(s.cards).toEqual({})
  })

  it('replaceState fills missing fields from defaults', async () => {
    const { store } = await boot({ now: NOW })
    store.update((d) => void (d.marks = ['5-9']))
    // an older backup without marks/xp and with partial settings
    store.replaceState({ v: 2, onboarded: true, settings: { target: 4 }, cards: {}, log: {} } as never)
    const s = store.getState()
    expect(s.settings.target).toBe(4)
    expect(s.settings.dailyNew).toBe(20)
    expect(s.marks).toEqual([])
    expect(s.xp).toBe(0)
  })
})

describe('store: backup validation', () => {
  const good = () => ({
    v: 2,
    onboarded: true,
    settings: { target: 4, examDate: '2027-07-04', dailyNew: 10, theme: 'light', apiKey: '', autoSpeak: false },
    cards: { '4-0': card({ due: Date.parse(NOW) }) },
    log: { '2026-11-12': { c: 3, n: 3, r: 0, p: 0 } },
    marks: ['4-0'],
    xp: 30,
  })

  it('accepts a real export', async () => {
    const { store } = await boot({ now: NOW })
    expect(store.isBackup(good())).toBe(true)
    expect(store.isBackup(JSON.parse(JSON.stringify(good())))).toBe(true)
  })

  it('accepts an older export without marks / xp', async () => {
    const { store } = await boot({ now: NOW })
    const { marks: _m, xp: _x, ...old } = good()
    expect(store.isBackup(old)).toBe(true)
  })

  it('rejects files that would crash the app once loaded', async () => {
    const { store } = await boot({ now: NOW })
    const bad: unknown[] = [
      null,
      [],
      'text',
      { ...good(), v: 1 },
      { ...good(), cards: undefined },
      { ...good(), settings: undefined },
      { ...good(), cards: { '4-0': null } },
      { ...good(), cards: { '4-0': { due: 'soon', state: 2 } } },
      { ...good(), cards: { '9-0': card({ due: 0 }) } },
      { ...good(), cards: { banana: card({ due: 0 }) } },
      { ...good(), cards: { '5-718': card({ due: 0 }) } }, // N5 has 718 words: index out of range

      { ...good(), log: null },
      { ...good(), log: { '2026-11-12': null } },
      { ...good(), marks: 'x' },
      { ...good(), xp: '30' },
      { ...good(), settings: { ...good().settings, target: 7 } },
    ]
    for (const b of bad) expect(store.isBackup(b), JSON.stringify(b)).toBe(false)
  })
})

describe('store: storage full', () => {
  it('drops cached AI explanations rather than losing study progress', async () => {
    const storage = new MemoryStorage()
    for (let i = 0; i < 20; i++) storage.setItem(`kasane.ai.5-${i}`, 'x'.repeat(1000))
    storage.setItem('other.app.key', 'keep')
    const { store } = await boot({ now: NOW, storage })
    store.update((d) => void (d.onboarded = true))
    // the quota is now just enough for the study state, not for the AI cache as well
    storage.quota = storage.getItem(KEY)!.length + KEY.length + 'other.app.key'.length + 4 + 2000
    store.update((d) => void (d.xp = 42))
    expect(JSON.parse(storage.getItem(KEY)!).xp).toBe(42)
    expect(storage.getItem('kasane.ai.5-0')).toBeNull()
    expect(storage.getItem('other.app.key')).toBe('keep')
  })
})
