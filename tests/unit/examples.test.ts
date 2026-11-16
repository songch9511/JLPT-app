// Example sentences (data/examples/README.md): the source file, its build into public/data, the levels the app knows
// have them, and which segments spell the headword (their furigana waits for 히라가나 on the study card).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS build helpers
import { checkExamples, exampleFile, loadWords } from '../../scripts/build-data.mjs'
import { EXAMPLE_LEVELS, headwordCore, headwordSegments, type Example, type Segment } from '../../src/examples'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const source = JSON.parse(read('data/examples/n5.json')) as Record<string, Example>
const shipped = JSON.parse(read('public/data/examples-n5.json')) as Record<string, Example>
const rows = JSON.parse(read('public/data/words-n5.json')) as string[][]
const KANJI = /[㐀-鿿々〆ヶ]/

describe('example sentences: the data', () => {
  it('every N5 word has one, and every id is an N5 word', () => {
    const ids = rows.map((r) => r[0])
    expect(Object.keys(source).sort()).toEqual([...ids].sort())
    expect(Object.keys(source)).toHaveLength(718)
  })

  it('the shipped file is the build of the source, entry for entry', () => {
    expect(read('public/data/examples-n5.json')).toBe(exampleFile(source))
    expect(shipped).toEqual(source)
  })

  it('segments join into a sentence; kanji segments carry a hiragana reading, kana segments none', () => {
    for (const [id, e] of Object.entries(shipped)) {
      expect(e.seg.length, id).toBeGreaterThan(0)
      const ja = e.seg.map((g) => g[0]).join('')
      expect(ja, id).toMatch(/[。？]$/)
      for (const g of e.seg) {
        expect(g[0].length, id).toBeGreaterThan(0)
        if (KANJI.test(g[0])) {
          expect(g, `${id} ${g[0]}`).toHaveLength(2)
          expect(g[1], `${id} ${g[0]}`).toMatch(/^[ぁ-ゖー]+$/)
          expect(g[0], `${id}: okurigana is its own segment`).not.toMatch(/[ぁ-ゖ]/)
        } else expect(g, `${id} ${g[0]}`).toHaveLength(1)
      }
    }
  })

  it('w047 reads お + 腹(なか), not お腹 as one segment', () => {
    expect(shipped.w047.seg).toContainEqual(['お'])
    expect(shipped.w047.seg).toContainEqual(['腹', 'なか'])
    expect(shipped.w047.seg.some((g) => g[0] === 'お腹')).toBe(false)
  })

  it('every translation is in one register (합니다체); requests stay …주세요.', () => {
    for (const [id, e] of Object.entries(shipped)) {
      expect(e.ko, id).toMatch(/[가-힣]/)
      expect(e.ko, id).toMatch(/(니다\.|니까[?.]|시다\.|주세요\.)$/)
      expect(e.ko.endsWith('요.') && !e.ko.endsWith('주세요.'), `${id}: ${e.ko}`).toBe(false)
      expect(e.ko.endsWith('요?'), `${id}: ${e.ko}`).toBe(false)
    }
  })

  it('the build checks the source against the live words and finds nothing wrong', () => {
    const words = loadWords()
    expect(checkExamples(5, source, words[5])).toEqual([])
  })

  it('the build refuses an unknown id, a kanji segment without reading, a reading on kana, kana inside kanji, no translation', () => {
    const words = loadWords()
    const bad = (e: unknown) => checkExamples(5, { w000: e }, words[5])
    expect(checkExamples(5, { wzzz: source.w000 }, words[5]).join()).toMatch(/not a word of N5/)
    expect(checkExamples(4, { w000: source.w000 }, words[4]).join()).toMatch(/not a word of N4/)
    expect(bad({ seg: [['毎日'], ['です。']], ko: '매일입니다.' }).join()).toMatch(/no reading/)
    expect(bad({ seg: [['です。', 'です']], ko: '입니다.' }).join()).toMatch(/reading on kana/)
    expect(bad({ seg: [['お腹', 'おなか'], ['です。']], ko: '배입니다.' }).join()).toMatch(/kana inside a kanji segment/)
    expect(bad({ seg: [['本', 'ホン'], ['です。']], ko: '책입니다.' }).join()).toMatch(/not in hiragana/)
    expect(bad({ seg: [['本', 'ほん'], ['です']], ko: '책입니다.' }).join()).toMatch(/does not end/)
    expect(bad({ seg: [['本', 'ほん'], ['です。']], ko: '' }).join()).toMatch(/no Korean/)
    expect(bad({ seg: [] , ko: '책' }).join()).toMatch(/no segments/)
  })

  it('the app knows which levels have examples: exactly those with a file in public/data and in data/examples', () => {
    for (const l of [5, 4, 3, 2, 1] as const) {
      expect(existsSync(new URL(`../../public/data/examples-n${l}.json`, import.meta.url)), `N${l}`).toBe(EXAMPLE_LEVELS.includes(l))
      expect(existsSync(new URL(`../../data/examples/n${l}.json`, import.meta.url)), `N${l}`).toBe(EXAMPLE_LEVELS.includes(l))
    }
  })
})

describe('example sentences: the headword in the sentence', () => {
  const seg = (...s: Segment[]) => s

  it('the core is the headword up to its last kanji, or a kana word without its last kana', () => {
    expect(headwordCore('勉強')).toBe('勉強')
    expect(headwordCore('行く')).toBe('行')
    expect(headwordCore('お腹')).toBe('お腹')
    expect(headwordCore('～がる')).toBe('がる')
    expect(headwordCore('ください')).toBe('くださ')
  })

  it('marks the segment that spells the headword, and only it', () => {
    const s = seg(['毎日', 'まいにち'], ['、'], ['図書館', 'としょかん'], ['で'], ['勉強', 'べんきょう'], ['します。'])
    expect(headwordSegments('勉強', s)).toEqual([false, false, false, false, true, false])
    // an inflected verb: its kanji
    expect(headwordSegments('行く', seg(['駅', 'えき'], ['へ'], ['行', 'い'], ['きます。']))).toEqual([false, false, true, false])
  })

  it('a headword split over several segments marks each of them', () => {
    expect(headwordSegments('一年生', seg(['弟', 'おとうと'], ['は'], ['一', 'いち'], ['年生', 'ねんせい'], ['です。']))).toEqual([false, false, true, true, false])
    expect(headwordSegments('お腹', shipped.w047.seg).filter(Boolean)).toHaveLength(2)
  })

  it('the first of several written forms that appears', () => {
    expect(headwordSegments('上手; じょうず', seg(['父', 'ちち'], ['は'], ['上手', 'じょうず'], ['です。']))).toEqual([false, false, true, false])
  })

  it('a headword not found in the sentence marks nothing', () => {
    expect(headwordSegments('する', seg(['毎朝', 'まいあさ'], ['テニスをします。']))).toEqual([false, false])
    expect(headwordSegments('猫', seg(['犬', 'いぬ'], ['です。']))).toEqual([false, false])
  })

  it('finds the headword of nearly every shipped kanji word', () => {
    let kanjiWords = 0
    let found = 0
    for (const [id, w] of rows) {
      if (!KANJI.test(w)) continue
      kanjiWords++
      if (headwordSegments(w, shipped[id].seg).some(Boolean)) found++
    }
    expect(found / kanjiWords).toBeGreaterThan(0.95)
  })
})

describe('the study card’s kanji row (sound.ts kanjiParts)', () => {
  it('pairs each kanji with its Korean syllable and its Japanese reading, only when all three match one to one', async () => {
    const { kanjiParts } = await import('../../src/sound')
    expect(kanjiParts({ w: '勉強', sk: '면강', rt: 'on', a: 'べん|きょう' })).toEqual([
      { kanji: '勉', ko: '면', ja: 'べん' },
      { kanji: '強', ko: '강', ja: 'きょう' },
    ])
    // not read on'yomi throughout, no split, a mismatch, or alternative spellings: no row
    expect(kanjiParts({ w: '勉強', sk: '면강', rt: 'mix', a: 'べん|きょう' })).toEqual([])
    expect(kanjiParts({ w: '勉強', sk: '면강', rt: 'on', a: '' })).toEqual([])
    expect(kanjiParts({ w: '勉強', sk: '면', rt: 'on', a: 'べん|きょう' })).toEqual([])
    expect(kanjiParts({ w: '上手; 上手い', sk: '상수', rt: 'on', a: 'じょう|ず' })).toEqual([])
  })
})
