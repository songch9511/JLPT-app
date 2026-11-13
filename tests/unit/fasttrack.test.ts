// The cognate fast-track (03 §2.4, §3 C): frequency order, reading cards for words tagged S, per-word stats,
// the state migration, and readiness with mixed card types.
import { describe, expect, it } from 'vitest'
import { at, boot, bootUser, card, DAY, KEY } from './helpers'
import type { SCard, State } from '../../src/store'

const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)
const EXAM = Date.parse('2026-12-06T09:00:00')

type Data = typeof import('../../src/data')

/** Registers N5's level data as the loader would: `order` (idx list, first introduced first) and the S words. */
function n5(data: Data, order: number[], fast: number[] = []) {
  const n = 718
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !order.includes(i))
  const full = [...order, ...rest]
  const words = Array.from({ length: n }, (_, idx) => ({ idx, o: full.indexOf(idx), k: (fast.includes(idx) ? 'S' : 'N') as 'S' | 'N' }))
  data.setLevelInfo(5, words)
}

async function setup(settings: Partial<State['settings']> = {}, cards: Record<string, SCard> = {}) {
  const b = await bootUser(NOW, { target: 5, includeLower: false, dailyNew: 10, examDate: '2026-12-06', ...settings })
  b.store.update((d) => void (d.cards = cards))
  const data = await import('../../src/data')
  return { ...b, data }
}

describe('introduction order', () => {
  it('new words come in the data’s frequency order, not idx order', async () => {
    const { srs, store, data } = await setup()
    n5(data, [42, 7, 300])
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.next).toEqual({ id: '5-42', kind: 'new' })
    srs.answer('5-42', srs.Rating.Good, at(NOW))
    expect(srs.buildQueue(store.getState(), at(NOW), '5-42').next?.id).toBe('5-7')
  })

  it('a learner part-way through a level keeps every word seen; the next new words are the unseen ones of the new order', async () => {
    // seen in the old idx order: 5-0 … 5-4, and 5-7 which the new order puts second
    const seen = ['5-0', '5-1', '5-2', '5-3', '5-4', '5-7']
    const cards = Object.fromEntries(seen.map((id) => [id, card({ due: T + 5 * DAY })]))
    const { srs, store, data } = await setup({ dailyNew: 3 }, cards)
    n5(data, [42, 7, 3, 300, 0, 9])
    const s = store.getState()
    expect(srs.breakdowns(s)[5].new).toBe(718 - 6)
    const fresh: string[] = []
    let st = s
    for (let i = 0; i < 3; i++) {
      const q = srs.buildQueue(st, at(NOW), fresh[fresh.length - 1])
      expect(q.next?.kind).toBe('new')
      fresh.push(q.next!.id)
      srs.answer(q.next!.id, srs.Rating.Good, at(NOW))
      st = store.getState()
    }
    expect(fresh).toEqual(['5-42', '5-300', '5-9'])
    for (const id of seen) expect(st.cards[id]).toEqual(cards[id])
  })

  it('before the level’s data has loaded the queue falls back to idx order', async () => {
    const { srs, store } = await setup()
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe('5-0')
  })

  it('the loader turns rows into words and keeps idx order when a file has no order column', async () => {
    const { data } = await setup()
    const w = data.parseRow(4, ['産業', 'さんぎょう', '산업', 'industry', 12, 51, 'S', '산업', '', 'on', 'さん|ぎょう'], 3)
    expect(w).toMatchObject({ id: '4-3', o: 12, f: 51, k: 'S', sk: '산업', rt: 'on', a: 'さん|ぎょう' })
    expect(data.parseRow(4, ['犬', 'いぬ', '개', 'dog'], 9)).toMatchObject({ o: 9, f: 0, k: '', sk: '', ff: '' })
  })
})

describe('reading cards (fast-track)', () => {
  it('a word tagged S is introduced with its reading card `<id>:r`; others with the meaning card', async () => {
    const { srs, store, data } = await setup()
    n5(data, [10, 11], [10])
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.next).toEqual({ id: '5-10:r', kind: 'new' })
    expect(q.freshReading).toBe(1)
    srs.answer('5-10:r', srs.gradeReading(2, 2), at(NOW))
    const s = store.getState()
    expect(s.cards['5-10:r']).toBeDefined()
    expect(s.cards['5-10']).toBeUndefined()
    expect(s.log['2026-11-13']).toMatchObject({ c: 1, n: 1 })
    expect(srs.buildQueue(s, at(NOW), '5-10:r').next?.id).toBe('5-11')
  })

  it('grading: the right choice is Good, a wrong one or "모르겠어요" is Again; FSRS treats each like a meaning card', async () => {
    const { srs, store, data } = await setup()
    n5(data, [10], [10])
    expect(srs.gradeReading(1, 1)).toBe(srs.Rating.Good)
    expect(srs.gradeReading(0, 1)).toBe(srs.Rating.Again)
    expect(srs.gradeReading(-1, 1)).toBe(srs.Rating.Again)
    // a review card answered wrongly lapses into relearning; answered right it moves out
    const due = card({ due: T - DAY, stability: 10, scheduled_days: 10, last_review: T - 11 * DAY })
    store.update((d) => void (d.cards = { '5-10:r': due, '5-20': due }))
    srs.answer('5-10:r', srs.gradeReading(0, 1), at(NOW))
    srs.answer('5-20', srs.Rating.Again, at(NOW))
    const s = store.getState()
    expect(s.cards['5-10:r']).toMatchObject({ state: 3, lapses: 1 })
    expect(s.cards['5-10:r']).toEqual(s.cards['5-20'])
    expect(s.log['2026-11-13']).toMatchObject({ c: 2, n: 0, r: 2, p: 0 })
    srs.answer('5-10:r', srs.Rating.Good, at('2026-11-13T09:20:00'))
    expect(store.getState().cards['5-10:r'].state).toBe(2)
  })

  it('with the fast-track off every word gets a meaning card and reading cards rest (not shown, not counted)', async () => {
    const r = card({ due: T - DAY })
    const { srs, store, data } = await setup({ fastTrack: false }, { '5-10:r': r })
    n5(data, [10, 11], [10])
    const s = store.getState()
    const q = srs.buildQueue(s, at(NOW))
    expect(q.review).toBe(0)
    // 5-10 was only learned through its reading: it is new for its meaning
    expect(q.next).toEqual({ id: '5-10', kind: 'new' })
    expect(q.freshReading).toBe(0)
    expect(srs.breakdowns(s)[5].new).toBe(718)
    expect(srs.forecast(s, at(NOW))[0]).toBe(0)
    // turning it back on brings the reading card back as it was
    store.update((d) => void (d.settings.fastTrack = true))
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe('5-10:r')
    expect(store.getState().cards['5-10:r']).toEqual(r)
  })

  it('a word that already has a meaning card keeps it: no reading card is added', async () => {
    const { srs, store, data } = await setup({}, { '5-10': card({ due: T + 3 * DAY }) })
    n5(data, [10, 11], [10])
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe('5-11')
  })
})

describe('words, not cards, in stats and queues', () => {
  it('a word with a meaning and a reading card counts once, at its weakest stage', async () => {
    const mature = card({ due: T + 40 * DAY, scheduled_days: 40 })
    const learning = card({ due: T + 5 * 60_000, state: 1, scheduled_days: 0 })
    const { srs, store } = await setup({}, { '5-1': mature, '5-1:r': learning, '5-2': mature })
    const s = store.getState()
    expect(srs.breakdowns(s)[5]).toEqual({ new: 716, learning: 1, young: 0, mature: 1 })
    expect(srs.wordStage(s, '5-1')).toBe('learning')
    expect(srs.newWordsLeft(s)).toBe(716)
  })

  it('only one card of a word comes up a day: a sibling answered today or also due waits', async () => {
    const due = card({ due: T - DAY })
    const { srs, store } = await setup({ dailyNew: 0 }, { '5-1': due, '5-1:r': due, '5-2': due })
    let q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.review).toBe(2)
    srs.answer(q.next!.id, srs.Rating.Good, at(NOW))
    q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.review).toBe(1)
    expect(q.next?.id).toBe('5-2')
  })

  it('weak words are listed once with the most lapses of their cards', async () => {
    const { srs, store } = await setup({}, { '5-1': card({ due: T, lapses: 2 }), '5-1:r': card({ due: T, lapses: 4 }), '5-3': card({ due: T, lapses: 3 }) })
    const s = store.getState()
    expect(srs.leechIds(s.cards)).toEqual(['5-1', '5-3'])
    expect(srs.wordLapses(s, '5-1')).toBe(4)
    expect(srs.leechIds(s.cards, 40, false)).toEqual(['5-3', '5-1'])
  })
})

describe('readiness with mixed card types', () => {
  const rev = (s: number, ago: number, dueIn: number) => card({ due: T + dueIn * DAY, last_review: T - ago * DAY, stability: s, scheduled_days: ago + dueIn })

  it('reading-only, meaning-only and two-card words each count once; a two-card word counts its weaker card', async () => {
    const cards = { '5-0:r': rev(30, 1, 40), '5-1': rev(30, 1, 40), '5-2': rev(30, 1, 40), '5-2:r': rev(2, 3, 40) }
    const { store } = await setup({ dailyNew: 0 }, cards)
    const rd = await import('../../src/readiness')
    const r = rd.readiness(store.getState(), at(NOW))
    const R = (c: SCard) => rd.recallAt(c, EXAM)
    expect(r.unseen).toBe(718 - 3)
    expect(r.stop).toBeCloseTo(R(cards['5-0:r']) + R(cards['5-1']) + Math.min(R(cards['5-2']), R(cards['5-2:r'])), 9)
  })

  it('with the fast-track off, resting reading cards do not count: those words are unseen', async () => {
    const cards = { '5-0:r': rev(30, 1, 40), '5-1': rev(30, 1, 40), '5-2': rev(30, 1, 40), '5-2:r': rev(2, 3, 40) }
    const { store } = await setup({ dailyNew: 0, fastTrack: false }, cards)
    const rd = await import('../../src/readiness')
    const r = rd.readiness(store.getState(), at(NOW))
    expect(r.unseen).toBe(718 - 2)
    expect(r.stop).toBeCloseTo(rd.recallAt(cards['5-1'], EXAM) + rd.recallAt(cards['5-2'], EXAM), 9)
  })
})

describe('state v2 → v3 and backups', () => {
  const v2 = {
    v: 2,
    onboarded: true,
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 20, theme: 'system', autoSpeak: false, includeLower: false, goal: 0.8 },
    cards: { '5-10': card({ due: T + DAY }) },
    log: {},
    marks: ['5-10'],
    xp: 30,
  }

  it('an older saved state loads as v3 with the fast-track on and its cards untouched', async () => {
    const { store } = await boot({ now: NOW, saved: v2 })
    const s = store.getState()
    expect(s.v).toBe(3)
    expect(s.settings.fastTrack).toBe(true)
    expect(s.cards).toEqual(v2.cards)
    expect(s.marks).toEqual(['5-10'])
  })

  it('a saved state keeps a fast-track the learner turned off; the next save writes v3', async () => {
    const { store, ls } = await boot({ now: NOW, saved: { ...v2, v: 3, settings: { ...v2.settings, fastTrack: false } } })
    expect(store.getState().settings.fastTrack).toBe(false)
    store.update((d) => void (d.xp = 31))
    expect(JSON.parse(ls.getItem(KEY)!)).toMatchObject({ v: 3, settings: { fastTrack: false } })
  })

  it('backups: old files (format 1 / plain v2) import and are migrated; v3 files with reading cards round-trip', async () => {
    const { store } = await boot({ now: NOW })
    const backup = await import('../../src/backup')
    for (const old of [v2, { ...v2, format: 'jlpt-luma-backup', formatVersion: 1 }]) {
      const r = backup.readBackup(old)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.state).toMatchObject({ v: 3, settings: { fastTrack: true }, cards: v2.cards })
    }
    store.update((d) => void (d.cards = { ...d.cards, '5-10:r': card({ due: T }) }))
    const file = JSON.parse(JSON.stringify(backup.backupFile(store.getState())))
    expect(file).toMatchObject({ formatVersion: 2, v: 3 })
    const r = backup.readBackup(file)
    expect(r.ok && Object.keys(r.state.cards)).toEqual(['5-10:r'])
    if (r.ok) store.importState(r.state)
    expect(store.getState().cards['5-10:r']).toBeDefined()
    expect(store.undoImport()).toBe(true)
  })

  it('a reading-card id is only valid in a v3 state, and must point at a real word', async () => {
    const { store } = await boot({ now: NOW })
    const c = card({ due: T })
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-1:r': c } })).toBe(true)
    expect(store.isBackup({ ...v2, cards: { '5-1:r': c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-718:r': c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-1:x': c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 4 })).toBe(false)
  })
})
