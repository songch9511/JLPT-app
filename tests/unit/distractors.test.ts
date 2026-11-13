// Reading questions (03 §3 「읽기 오답 보기 생성」) and the sound-correspondence hints (02 F4).
import { describe, expect, it } from 'vitest'
import { alternatives, plausible, readingOf, readingQuestion, soundKey, soundVariants } from '../../src/distractors'
import { soundHints } from '../../src/sound'
import type { Level, Word } from '../../src/data'

let n = 0
const word = (w: string, r: string, p: Partial<Word> = {}): Word => ({
  id: `3-${n}`,
  level: 3 as Level,
  idx: n++,
  w,
  r,
  ko: '',
  en: '',
  o: 0,
  f: 0,
  k: 'S',
  sk: '',
  ff: '',
  rt: 'on',
  a: '',
  ...p,
})

const POOL = [
  word('産業', 'さんぎょう', { sk: '산업' }),
  word('産地', 'さんち'),
  word('工業', 'こうぎょう'),
  word('残業', 'ざんぎょう'),
  word('作業', 'さぎょう'),
  word('学校', 'がっこう'),
  word('日本', 'にほん'),
  word('日本', 'にっぽん', { level: 5 }),
  word('日記', 'にっき'),
  word('二本', 'にほん'),
  word('散歩', 'さんぽ (する)'),
  word('数字', 'すうじ'),
  word('主食', 'しゅしょく'),
  word('修理', 'しゅうり'),
]
const find = (w: string, r?: string) => POOL.find((x) => x.w === w && (!r || x.r === r))!

describe('reading question', () => {
  it('has four different choices with the answer once, and no wrong choice that sounds like a right reading', () => {
    for (const w of POOL) {
      const q = readingQuestion(w, POOL, `${w.id}:r|0`)
      expect(q.choices).toHaveLength(4)
      expect(new Set(q.choices.map(soundKey)).size).toBe(4)
      expect(q.choices[q.answer]).toBe(readingOf(w))
      expect(q.choices.filter((c) => c === readingOf(w))).toHaveLength(1)
      for (const [i, c] of q.choices.entries()) if (i !== q.answer) expect(plausible(c), c).toBe(true)
    }
  })

  it('never offers another entry’s reading of the same written word as a wrong choice (日本 にほん / にっぽん)', () => {
    for (let k = 0; k < 50; k++) {
      const q = readingQuestion(find('日本', 'にほん'), POOL, `seed${k}`)
      expect(q.choices).not.toContain('にっぽん')
    }
  })

  it('is the same for the same card showing and changes with the next one', () => {
    const w = find('産業')
    const a = readingQuestion(w, POOL, '3-0:r|2')
    expect(readingQuestion(w, POOL, '3-0:r|2')).toEqual(a)
    const others = Array.from({ length: 8 }, (_, k) => readingQuestion(w, POOL, `3-0:r|${3 + k}`).choices.join())
    expect(others.some((c) => c !== a.choices.join())).toBe(true)
  })

  it('wrong choices come from the sound rules and from a same-level word', () => {
    const q = readingQuestion(find('産業'), POOL, 'x')
    const rules = q.rules.filter((r) => r !== 'answer')
    expect(rules).toHaveLength(3)
    expect(rules.filter((r) => r === 'word').length).toBeLessThanOrEqual(2)
    // the same-level word shares a kanji with 産業 when one is available
    const wordChoice = q.choices[q.rules.indexOf('word')]
    expect(['さんち', 'こうぎょう', 'ざんぎょう', 'さぎょう', 'しゅうり']).toContain(wordChoice)
  })

  it('uses the first reading, without notes', () => {
    expect(readingOf(find('散歩'))).toBe('さんぽ')
    expect(alternatives('かんじる; かんずる')).toEqual(['かんじる', 'かんずる'])
    expect(alternatives('～ちゅう')).toEqual(['ちゅう'])
  })
})

describe('sound rules', () => {
  const of = (s: string, rule: string) => soundVariants(s).filter(([, r]) => r === rule).map(([x]) => x)
  it('long vowels, voicing, the small っ and small ゃゅょ', () => {
    expect(of('さんぎょう', 'short')).toEqual(['さんぎょ'])
    expect(of('しゅしょく', 'long')).toEqual(expect.arrayContaining(['しゅうしょく']))
    expect(of('こだい', 'long')).toEqual(['こうだい'])
    expect(of('こだい', 'voice')).toEqual(expect.arrayContaining(['ごだい', 'こたい']))
    expect(of('がっこう', 'sokuon')).toEqual(['がこう'])
    expect(of('がくし', 'sokuon')).toEqual(['がっし'])
    expect(of('きょう', 'youon')).toEqual(['きよう'])
  })
  it('does not make shapes a Japanese word cannot have', () => {
    // no lengthening inside がく, no voiced syllable-final く, no っ after a long vowel or before a vowel
    expect(soundVariants('がくし').map(([x]) => x)).not.toContain('がくうし')
    expect(soundVariants('しゅしょく').map(([x]) => x)).not.toContain('しゅしょぐ')
    expect(soundVariants('はいぐうしゃ').map(([x]) => x)).not.toContain('はいぐうっしゃ')
    for (const bad of ['っか', 'かっ', 'かっあ', 'んか', 'かゃ', 'ちぢむ']) expect(plausible(bad), bad).toBe(false)
    expect(plausible('ちぢむ', true)).toBe(true)
  })
  it('two spellings of one sound are the same reading', () => {
    expect(soundKey('とおり')).toBe(soundKey('とうり'))
    expect(soundKey('ぢ')).toBe(soundKey('じ'))
    expect(soundKey('さんぎょう')).not.toBe(soundKey('さんぎょ'))
  })
})

describe('sound-correspondence hints', () => {
  it('shows the rule for each kanji whose split reading ends as the Korean final consonant says', () => {
    const h = soundHints({ w: '産業', sk: '산업', rt: 'on', a: 'さん|ぎょう' })
    expect(h).toEqual([
      { kanji: '産', ko: '산', ja: 'さん', rule: 'ㄴ 받침 → ん' },
      { kanji: '業', ko: '업', ja: 'ぎょう', rule: 'ㅂ 받침 → う' },
    ])
    expect(soundHints({ w: '学生', sk: '학생', rt: 'on', a: 'がく|せい' }).map((x) => x.rule)).toEqual(['ㄱ 받침 → く·き', 'ㅇ 받침 → う·い'])
  })
  it('skips what it cannot vouch for', () => {
    // no split, not on'yomi, a syllable without a covered final, っ-assimilated, sai-siot spelling, alternative forms
    expect(soundHints({ w: '産業', sk: '산업', rt: 'on', a: '' })).toEqual([])
    expect(soundHints({ w: '薬', sk: '약', rt: 'kun', a: 'くすり' })).toEqual([])
    expect(soundHints({ w: '古代', sk: '고대', rt: 'on', a: 'こ|だい' })).toEqual([])
    expect(soundHints({ w: '学校', sk: '학교', rt: 'on', a: 'がっ|こう' })).toEqual([])
    expect(soundHints({ w: '数字', sk: '숫자', rt: 'on', a: 'すう|じ' })).toEqual([])
    expect(soundHints({ w: '立', sk: '립', rt: 'on', a: 'りつ' })).toEqual([])
    expect(soundHints({ w: '産業; 産業', sk: '산업', rt: 'on', a: 'さん|ぎょう' })).toEqual([])
  })
})
