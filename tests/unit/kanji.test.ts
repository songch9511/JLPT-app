// Kanji study (2026-11-16): the kanji of the word lists (scripts/build-data.mjs `kanjiRows`, public/data/kanji.json),
// their levels and readings, how a word's reading is cut per kanji for the card's chips, and the reading cards of the
// removed fast-track folded into their words' cards (store.ts `migrateIds`), on a legacy fixture.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS build helpers
import { kanjiRows, loadInputs, loadWords } from '../../scripts/build-data.mjs'
import { alignReading, isKanjiId, KANJI_COUNTS, kanjiLevel, kunParts, kunText, toHiragana, type Kanji } from '../../src/kanji'
import { boot, card, DAY, KEY, L, LEGACY_KEY, legacyKeys } from './helpers'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
type Row = [string, number, string, string, string, string, string, string[]]
const shipped = JSON.parse(read('public/data/kanji.json')) as Row[]
const words = new Map<string, string>()
for (const l of [1, 2, 3, 4, 5]) for (const r of JSON.parse(read(`public/data/words-n${l}.json`)) as string[][]) words.set(r[0], r[1])

describe('the kanji set', () => {
  it('every kanji of the word lists, at the first level whose words contain it: N5 450, N4 334, N3 657, N2 242, N1 291', () => {
    expect(shipped).toHaveLength(1974)
    expect(KANJI_COUNTS).toEqual({ 5: 450, 4: 334, 3: 657, 2: 242, 1: 291 })
    const per = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>
    for (const [k, l, , , , , , ids] of shipped) {
      per[l]++
      expect(kanjiLevel(`k${k}`)).toBe(l)
      // every word listed contains it, and the kanji's level is the easiest of those words' levels
      for (const id of ids) expect(words.get(id), `${k} ${id}`).toContain(k)
      expect(ids.length, k).toBeGreaterThan(0)
    }
    expect(per).toEqual(KANJI_COUNTS)
    expect(shipped.some(([k]) => k === '々')).toBe(false)
  })

  it('the shipped file is the build of the word lists and data/hanja', () => {
    const levels = loadWords()
    const inputs = loadInputs(levels)
    expect(JSON.stringify(kanjiRows(levels, inputs.order).rows)).toBe(read('public/data/kanji.json'))
  })

  it('훈음 from data/hanja/hun.json when it is there, else the first Korean reading with an empty 훈', () => {
    const levels = loadWords()
    const inputs = loadInputs(levels)
    const hun = existsSync(new URL('../../data/hanja/hun.json', import.meta.url)) ? JSON.parse(read('data/hanja/hun.json')) : null
    const strong = shipped.find(([k]) => k === '強')!
    expect(strong[3]).toBe('강')
    if (hun) expect(strong[2]).toBe(hun['強'].hun)
    // without the file: no 훈, the table's first reading as 음
    const bare = kanjiRows(levels, inputs.order, undefined, null).rows as Row[]
    const s = bare.find(([k]) => k === '強')!
    expect(s[2]).toBe('')
    expect(s[3]).toBe('강')
    expect(bare.map((r) => r[0])).toEqual(shipped.map((r) => r[0]))
  })

  it('kanji card ids are `k` + the kanji, apart from word ids', () => {
    expect(isKanjiId('k強')).toBe(true)
    expect(isKanjiId('w0k3')).toBe(false)
    expect(kanjiLevel('k強')).toBe(shipped.find(([k]) => k === '強')![1])
    expect(kanjiLevel('kZ')).toBeUndefined()
  })
})

describe('readings', () => {
  const table = new Map(shipped.map(([k, , , , on, kun]) => [k, { on: on ? on.split(' ') : [], kun: kun ? kun.split(' ') : [] } as Pick<Kanji, 'on' | 'kun'>]))
  const info = (k: string) => table.get(k) ?? null

  it('a word’s reading is cut per kanji from their on and kun readings (rendaku and っ too), or not at all', () => {
    expect(alignReading('勉強', 'べんきょう', info)).toEqual(['べん', 'きょう'])
    expect(alignReading('預ける', 'あずける', info)).toEqual(['あず'])
    expect(alignReading('図書館', 'としょかん', info)).toEqual(['と', 'しょ', 'かん'])
    expect(alignReading('学校', 'がっこう', info)).toEqual(['がっ', 'こう'])
    // irregular readings are not cut
    expect(alignReading('今日', 'きょう', info)).toBeNull()
  })

  it('kun readings: the okurigana after the dot', () => {
    expect(kunParts('つよ.い')).toEqual(['つよ', 'い'])
    expect(kunText('し.いる')).toBe('し(いる)')
    expect(kunText('-ひと')).toBe('ひと')
    expect(toHiragana('キョウ')).toBe('きょう')
  })
})

describe('the removed fast-track: reading cards fold into their words (legacy fixture)', () => {
  const T = Date.parse('2026-11-13T09:00:00')
  const meaning = card({ due: T + 5 * DAY, reps: 7 })
  const reading = card({ due: T + 9 * DAY, reps: 4 })
  const only = card({ due: T + 2 * DAY, reps: 3, lapses: 1 })

  it('a v3 state: a word with both cards keeps its own card, a word learned only with a reading card keeps that learning', async () => {
    const legacy = {
      v: 3,
      onboarded: true,
      settings: { target: 5, dailyNew: 10, theme: 'light', autoSpeak: false, includeLower: true, fastTrack: true },
      cards: legacyKeys({ [L('5-0')]: meaning, [L('5-0') + ':r']: reading, [L('5-1') + ':r']: only, [L('5-2')]: meaning }),
      log: { '2026-11-12': { c: 4, n: 2, r: 2, p: 2 } },
      marks: Object.keys(legacyKeys({ [L('5-1')]: 1 })),
      xp: 40,
    }
    const { store, ls } = await boot({ now: '2026-11-13T09:00:00', legacy })
    const s = store.getState()
    expect(s.cards).toEqual({ [L('5-0')]: meaning, [L('5-1')]: only, [L('5-2')]: meaning })
    expect(Object.keys(s.cards).some((id) => id.includes(':'))).toBe(false)
    expect(s.settings).not.toHaveProperty('fastTrack')
    expect(s.marks).toEqual([L('5-1')])
    expect(s.log).toEqual(legacy.log)
    // stored folded at once; the pre-migration copy is left as it was
    expect(Object.keys(JSON.parse(ls.getItem(KEY)!).cards)).toEqual([L('5-0'), L('5-1'), L('5-2')])
    expect(JSON.parse(ls.getItem(LEGACY_KEY)!).cards).toEqual(legacy.cards)
  })

  it('a v4 state saved by the version with reading cards folds the same way, and loading it again changes nothing', async () => {
    const saved = {
      v: 4,
      onboarded: true,
      settings: { target: 5, dailyNew: 10, theme: 'light', autoSpeak: false, includeLower: true, fastTrack: false },
      cards: { [L('5-3') + ':r']: reading, [L('5-3')]: meaning, [L('5-4') + ':r']: only },
      log: {},
      marks: [],
      xp: 0,
    }
    const first = await boot({ now: '2026-11-13T09:00:00', saved })
    expect(first.store.getState().cards).toEqual({ [L('5-3')]: meaning, [L('5-4')]: only })
    const again = await boot({ now: '2026-11-13T09:00:00', storage: first.ls })
    expect(again.store.getState().cards).toEqual({ [L('5-3')]: meaning, [L('5-4')]: only })
    expect(again.store.getState().settings.dailyKanji).toBe(5)
  })

  it('a backup with reading cards and kanji cards is valid and imports folded', async () => {
    const { store } = await boot({ now: '2026-11-13T09:00:00' })
    const backup = await import('../../src/backup')
    const read = backup.readBackup({
      format: 'jlpt-luma-backup',
      formatVersion: 3,
      exportedAt: '2026-11-02T10:00:00.000Z',
      v: 4,
      onboarded: true,
      settings: { target: 4, fastTrack: true },
      cards: { [L('5-5') + ':r']: only, 'k強': meaning },
      log: {},
      marks: ['k強'],
      xp: 0,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.exportedAt).toBe('2026-11-02T10:00:00.000Z')
    store.importState(read.state)
    expect(store.getState().cards).toEqual({ [L('5-5')]: only, 'k強': meaning })
    expect(store.getState().marks).toEqual(['k強'])
  })
})
