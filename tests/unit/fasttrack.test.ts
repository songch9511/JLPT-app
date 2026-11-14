// The cognate fast-track (03 §2.4, §3 C): frequency order, reading cards for words tagged S, per-word stats,
// the state migration, and word counts with mixed card types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { at, boot, bootUser, card, DAY, KEY, L } from './helpers'
import type { SCard, State } from '../../src/store'

const NOW = '2026-11-13T09:00:00'
const T = Date.parse(NOW)

type Data = typeof import('../../src/data')

/**
 * Registers N5's level data as the loader would: `order` (rows by their position, which is the N5 word's old
 * positional index; first introduced first) and the S words.
 */
function n5(data: Data, order: number[], fast: number[] = []) {
  const n = 718
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !order.includes(i))
  const full = [...order, ...rest]
  const words = Array.from({ length: n }, (_, idx) => ({ id: L(`5-${idx}`), idx, o: full.indexOf(idx), k: (fast.includes(idx) ? 'S' : 'N') as 'S' | 'N' }))
  data.setLevelInfo(5, words)
}

async function setup(settings: Partial<State['settings']> = {}, cards: Record<string, SCard> = {}) {
  const b = await bootUser(NOW, { target: 5, includeLower: false, dailyNew: 10, ...settings })
  b.store.update((d) => void (d.cards = cards))
  const data = await import('../../src/data')
  return { ...b, data }
}

describe('introduction order', () => {
  it('new words come in the data’s frequency order, not idx order', async () => {
    const { srs, store, data } = await setup()
    n5(data, [42, 7, 300])
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.next).toEqual({ id: L('5-42'), kind: 'new' })
    srs.answer(L('5-42'), srs.Rating.Good, at(NOW))
    expect(srs.buildQueue(store.getState(), at(NOW), L('5-42')).next?.id).toBe(L('5-7'))
  })

  it('a learner part-way through a level keeps every word seen; the next new words are the unseen ones of the new order', async () => {
    // seen in the old idx order: 5-0 … 5-4, and 5-7 which the new order puts second
    const seen = [L('5-0'), L('5-1'), L('5-2'), L('5-3'), L('5-4'), L('5-7')]
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
    expect(fresh).toEqual([L('5-42'), L('5-300'), L('5-9')])
    for (const id of seen) expect(st.cards[id]).toEqual(cards[id])
  })

  it('before the level’s data has loaded the queue falls back to the data’s row order (id order)', async () => {
    const { srs, store } = await setup()
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe(L('5-0'))
  })

  it('the loader turns rows into words (the id is the row’s own, never its position) and keeps row order when a file has no order column', async () => {
    const { data } = await setup()
    const w = data.parseRow(4, ['w0k3', '産業', 'さんぎょう', '산업', 'industry', 12, 51, 'S', '산업', '', 'on', 'さん|ぎょう'], 3)
    expect(w).toMatchObject({ id: 'w0k3', idx: 3, o: 12, f: 51, k: 'S', sk: '산업', rt: 'on', a: 'さん|ぎょう' })
    expect(data.parseRow(4, ['w0k4', '犬', 'いぬ', '개', 'dog'], 9)).toMatchObject({ id: 'w0k4', o: 9, f: 0, k: '', sk: '', ff: '' })
  })
})

describe('reading cards (fast-track)', () => {
  it('a word tagged S is introduced with its reading card `<id>:r`; others with the meaning card', async () => {
    const { srs, store, data } = await setup()
    n5(data, [10, 11], [10])
    const q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.next).toEqual({ id: L('5-10:r'), kind: 'new' })
    expect(q.freshReading).toBe(1)
    srs.answer(L('5-10:r'), srs.gradeReading(2, 2), at(NOW))
    const s = store.getState()
    expect(s.cards[L('5-10:r')]).toBeDefined()
    expect(s.cards[L('5-10')]).toBeUndefined()
    expect(s.log['2026-11-13']).toMatchObject({ c: 1, n: 1 })
    expect(srs.buildQueue(s, at(NOW), L('5-10:r')).next?.id).toBe(L('5-11'))
  })

  it('grading: the right choice is Good, a wrong one or "모르겠어요" is Again; FSRS treats each like a meaning card', async () => {
    const { srs, store, data } = await setup()
    n5(data, [10], [10])
    expect(srs.gradeReading(1, 1)).toBe(srs.Rating.Good)
    expect(srs.gradeReading(0, 1)).toBe(srs.Rating.Again)
    expect(srs.gradeReading(-1, 1)).toBe(srs.Rating.Again)
    // a review card answered wrongly lapses into relearning; answered right it moves out
    const due = card({ due: T - DAY, stability: 10, scheduled_days: 10, last_review: T - 11 * DAY })
    store.update((d) => void (d.cards = { [L('5-10:r')]: due, [L('5-20')]: due }))
    srs.answer(L('5-10:r'), srs.gradeReading(0, 1), at(NOW))
    srs.answer(L('5-20'), srs.Rating.Again, at(NOW))
    const s = store.getState()
    expect(s.cards[L('5-10:r')]).toMatchObject({ state: 3, lapses: 1 })
    expect(s.cards[L('5-10:r')]).toEqual(s.cards[L('5-20')])
    expect(s.log['2026-11-13']).toMatchObject({ c: 2, n: 0, r: 2, p: 0 })
    srs.answer(L('5-10:r'), srs.Rating.Good, at('2026-11-13T09:20:00'))
    expect(store.getState().cards[L('5-10:r')].state).toBe(2)
  })

  it('with the fast-track off every word gets a meaning card and reading cards rest (not shown, not counted)', async () => {
    const r = card({ due: T - DAY })
    const { srs, store, data } = await setup({ fastTrack: false }, { [L('5-10:r')]: r })
    n5(data, [10, 11], [10])
    const s = store.getState()
    const q = srs.buildQueue(s, at(NOW))
    expect(q.review).toBe(0)
    // 5-10 was only learned through its reading: it is new for its meaning
    expect(q.next).toEqual({ id: L('5-10'), kind: 'new' })
    expect(q.freshReading).toBe(0)
    expect(srs.breakdowns(s)[5].new).toBe(718)
    expect(srs.forecast(s, at(NOW))[0]).toBe(0)
    // turning it back on brings the reading card back as it was
    store.update((d) => void (d.settings.fastTrack = true))
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe(L('5-10:r'))
    expect(store.getState().cards[L('5-10:r')]).toEqual(r)
  })

  it('a word that already has a meaning card keeps it: no reading card is added', async () => {
    const { srs, store, data } = await setup({}, { [L('5-10')]: card({ due: T + 3 * DAY }) })
    n5(data, [10, 11], [10])
    expect(srs.buildQueue(store.getState(), at(NOW)).next?.id).toBe(L('5-11'))
  })
})

// Tags get corrected (docs/plan/12: 18 words stopped being S). A learner may hold a reading card for such a word —
// often its only card, the meaning card having been skipped. The card must not be lost or crash anything, must not
// keep coming as a reading card with a bridge word that misleads, and the word must get its meaning card.
describe('a word whose tag stops being S', () => {
  const mature = card({ due: T - DAY, stability: 40, scheduled_days: 30, last_review: T - 31 * DAY, lapses: 2 })

  it('its reading card rests (kept as it was, not shown, not counted) and the word is introduced with its meaning card', async () => {
    const { srs, store, data } = await setup({}, { [L('5-10:r')]: mature })
    const s = store.getState()
    // before the level's data has loaded nothing is known: the card is due as before
    expect(srs.buildQueue(s, at(NOW)).next).toEqual({ id: L('5-10:r'), kind: 'review' })
    // the data now tags 5-10 as something other than S; the same state object is not served from a stale memo
    n5(data, [10, 11])
    const q = srs.buildQueue(s, at(NOW))
    expect(q.review).toBe(0)
    expect(q.next).toEqual({ id: L('5-10'), kind: 'new' })
    expect(q.freshReading).toBe(0)
    expect(srs.isSeen(s, L('5-10'))).toBe(false)
    expect(srs.wordCards(s, L('5-10'))).toEqual([])
    expect(srs.wordStage(s, L('5-10'))).toBe('new')
    expect(srs.breakdowns(s)[5].new).toBe(718)
    expect(srs.forecast(s, at(NOW))[0]).toBe(0)
    expect(srs.leechIds(s.cards)).toEqual([])
    expect(srs.studyProgress(s)).toMatchObject({ total: 718, met: 0 })

    // the meaning card is learned like any new word's; the reading card stays exactly as it was, never shown
    srs.answer(L('5-10'), srs.Rating.Good, at(NOW))
    const after = store.getState()
    expect(after.cards[L('5-10')]).toBeDefined()
    expect(after.cards[L('5-10:r')]).toEqual(mature)
    expect(after.log['2026-11-13']).toMatchObject({ c: 1, n: 1, r: 0 })
    expect(srs.wordCards(after, L('5-10')).map((c) => c.id)).toEqual([L('5-10')])
    for (let i = 0; i < 5; i++) {
      const next = srs.buildQueue(after, at(NOW), L('5-10')).next
      expect(next?.id).not.toBe(L('5-10:r'))
      if (next) srs.answer(next.id, srs.Rating.Good, at(NOW))
    }
    expect(store.getState().cards[L('5-10:r')]).toEqual(mature)

    // tagged S again (a correction undone): the reading card comes back as it was, next to the meaning card
    n5(data, [10, 11], [10])
    const back = store.getState()
    expect(srs.wordCards(back, L('5-10')).map((c) => c.id)).toEqual([L('5-10'), L('5-10:r')])
    expect(back.cards[L('5-10:r')]).toEqual(mature)
  })

  it('a word that had both cards keeps studying its meaning card; the reading card rests', async () => {
    const meaning = card({ due: T - DAY })
    const { srs, store, data } = await setup({ dailyNew: 0 }, { [L('5-10')]: meaning, [L('5-10:r')]: mature })
    n5(data, [10, 11])
    const s = store.getState()
    const q = srs.buildQueue(s, at(NOW))
    expect(q.review).toBe(1)
    expect(q.next).toEqual({ id: L('5-10'), kind: 'review' })
    expect(srs.wordCards(s, L('5-10')).map((c) => c.id)).toEqual([L('5-10')])
    expect(srs.wordLapses(s, L('5-10'))).toBe(0)
  })

  it('the shipped data: 元気 (w0ed, was S 원기) and ～中 じゅう (w0g8, now F) with old reading cards get meaning cards', async () => {
    const rows = JSON.parse(readFileSync(new URL('../../public/data/words-n5.json', import.meta.url), 'utf8'))
    const { srs, store, data } = await setup({}, { 'w0ed:r': mature, 'w0g8:r': mature, 'w0fq:r': mature })
    const words = rows.map((r: Parameters<Data['parseRow']>[1], i: number) => data.parseRow(5, r, i))
    data.setLevelInfo(5, words)
    const byId = new Map(words.map((w: { id: string }) => [w.id, w]))
    expect(byId.get('w0ed')).toMatchObject({ k: 'J', sk: '원기' })
    expect(byId.get('w0g8')).toMatchObject({ k: 'F', sk: '중' })
    expect(byId.get('w0fq')).toMatchObject({ w: '一', k: 'S' })
    const s = store.getState()
    // 一 is still S: its reading card is due as a reading card; the other two are new words for their meaning
    const q = srs.buildQueue(s, at(NOW))
    expect(q.review).toBe(1)
    expect(srs.wordCards(s, 'w0fq').map((c) => c.id)).toEqual(['w0fq:r'])
    expect(srs.isSeen(s, 'w0ed')).toBe(false)
    expect(srs.isSeen(s, 'w0g8')).toBe(false)
    expect(srs.introCard(s, 'w0ed')).toBe('w0ed')
    expect(srs.introCard(s, 'w0g8')).toBe('w0g8')
    expect(srs.breakdowns(s)[5].new).toBe(717)
  })
})

describe('words, not cards, in stats and queues', () => {
  it('a word with a meaning and a reading card counts once, at its weakest stage', async () => {
    const mature = card({ due: T + 40 * DAY, scheduled_days: 40 })
    const learning = card({ due: T + 5 * 60_000, state: 1, scheduled_days: 0 })
    const { srs, store } = await setup({}, { [L('5-1')]: mature, [L('5-1:r')]: learning, [L('5-2')]: mature })
    const s = store.getState()
    expect(srs.breakdowns(s)[5]).toEqual({ new: 716, learning: 1, young: 0, mature: 1 })
    expect(srs.wordStage(s, L('5-1'))).toBe('learning')
    expect(srs.newWordsLeft(s)).toBe(716)
  })

  it('only one card of a word comes up a day: a sibling answered today or also due waits', async () => {
    const due = card({ due: T - DAY })
    const { srs, store } = await setup({ dailyNew: 0 }, { [L('5-1')]: due, [L('5-1:r')]: due, [L('5-2')]: due })
    let q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.review).toBe(2)
    srs.answer(q.next!.id, srs.Rating.Good, at(NOW))
    q = srs.buildQueue(store.getState(), at(NOW))
    expect(q.review).toBe(1)
    expect(q.next?.id).toBe(L('5-2'))
  })

  it('weak words are listed once with the most lapses of their cards', async () => {
    const { srs, store } = await setup({}, { [L('5-1')]: card({ due: T, lapses: 2 }), [L('5-1:r')]: card({ due: T, lapses: 4 }), [L('5-3')]: card({ due: T, lapses: 3 }) })
    const s = store.getState()
    expect(srs.leechIds(s.cards)).toEqual([L('5-1'), L('5-3')])
    expect(srs.wordLapses(s, L('5-1'))).toBe(4)
    expect(srs.leechIds(s.cards, 40, false)).toEqual([L('5-3'), L('5-1')])
  })
})

describe('word counts with mixed card types', () => {
  const rev = (s: number, ago: number, dueIn: number) => card({ due: T + dueIn * DAY, last_review: T - ago * DAY, stability: s, scheduled_days: ago + dueIn })

  it('reading-only, meaning-only and two-card words each count once; a two-card word counts its weaker card', async () => {
    const cards = { [L('5-0:r')]: rev(30, 1, 40), [L('5-1')]: rev(30, 1, 40), [L('5-2')]: rev(30, 1, 40), [L('5-2:r')]: rev(2, 3, 2) }
    const { store, srs } = await setup({ dailyNew: 0 }, cards)
    const s = store.getState()
    expect(srs.studyProgress(s)).toEqual({ levels: [5], total: 718, met: 3, mature: 2 })
    expect(srs.wordStage(s, L('5-2'))).toBe('young')
  })

  it('with the fast-track off, resting reading cards do not count: those words are unseen', async () => {
    const cards = { [L('5-0:r')]: rev(30, 1, 40), [L('5-1')]: rev(30, 1, 40), [L('5-2')]: rev(30, 1, 40), [L('5-2:r')]: rev(2, 3, 2) }
    const { store, srs } = await setup({ dailyNew: 0, fastTrack: false }, cards)
    expect(srs.studyProgress(store.getState())).toEqual({ levels: [5], total: 718, met: 2, mature: 2 })
  })
})

describe('state v2 → v3 → v4 and backups', () => {
  // as the version before stable ids saved it: positional ids
  const v2 = {
    v: 2,
    onboarded: true,
    // as saved then, with the exam date and goal the app had until 2026-11-14
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 20, theme: 'system', autoSpeak: false, includeLower: false, goal: 0.8 },
    cards: { '5-10': card({ due: T + DAY }) },
    log: {},
    marks: ['5-10'],
    xp: 30,
  }
  const migrated = { [L('5-10')]: v2.cards['5-10'] }

  it('an older saved state loads as v4 with the fast-track on and its cards untouched (ids made stable)', async () => {
    const { store } = await boot({ now: NOW, legacy: v2 })
    const s = store.getState()
    expect(s.v).toBe(4)
    expect(s.settings.fastTrack).toBe(true)
    expect(s.cards).toEqual(migrated)
    expect(s.marks).toEqual([L('5-10')])
  })

  it('a saved state keeps a fast-track the learner turned off; the next save writes v4', async () => {
    const { store, ls } = await boot({ now: NOW, legacy: { ...v2, v: 3, settings: { ...v2.settings, fastTrack: false } } })
    expect(store.getState().settings.fastTrack).toBe(false)
    store.update((d) => void (d.xp = 31))
    expect(JSON.parse(ls.getItem(KEY)!)).toMatchObject({ v: 4, settings: { fastTrack: false } })
  })

  it('backups: old files (format 1 / plain v2) import and are migrated; v4 files with reading cards round-trip', async () => {
    const { store } = await boot({ now: NOW })
    const backup = await import('../../src/backup')
    for (const old of [v2, { ...v2, format: 'jlpt-luma-backup', formatVersion: 1 }]) {
      const r = backup.readBackup(old)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.state).toMatchObject({ v: 4, settings: { fastTrack: true }, cards: migrated })
    }
    store.update((d) => void (d.cards = { ...d.cards, [L('5-10:r')]: card({ due: T }) }))
    const file = JSON.parse(JSON.stringify(backup.backupFile(store.getState())))
    expect(file).toMatchObject({ formatVersion: 3, v: 4 })
    const r = backup.readBackup(file)
    expect(r.ok && Object.keys(r.state.cards)).toEqual([L('5-10:r')])
    if (r.ok) store.importState(r.state)
    expect(store.getState().cards[L('5-10:r')]).toBeDefined()
    expect(store.undoImport()).toBe(true)
  })

  it('a positional reading-card id is only valid in a v3 state, and must point at a real word; v4 ids must be well formed', async () => {
    const { store } = await boot({ now: NOW })
    const c = card({ due: T })
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-1:r': c } })).toBe(true)
    expect(store.isBackup({ ...v2, cards: { '5-1:r': c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-718:r': c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 3, cards: { '5-1:x': c } })).toBe(false)
    // a v4 file names words by stable id only
    expect(store.isBackup({ ...v2, v: 4 })).toBe(false)
    expect(store.isBackup({ ...v2, v: 4, cards: { [L('5-1:r')]: c }, marks: [] })).toBe(true)
    expect(store.isBackup({ ...v2, v: 4, cards: { [L('5-1') + ':x']: c }, marks: [] })).toBe(false)
    expect(store.isBackup({ ...v2, v: 3, cards: { [L('5-1')]: c } })).toBe(false)
    expect(store.isBackup({ ...v2, v: 5, cards: {} })).toBe(false)
  })
})
