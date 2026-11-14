// Reading questions (03 §3 「읽기 오답 보기 생성」) and the sound-correspondence hints (02 F4).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alternatives, MIN_WRONG, moraCount, plausible, readingOf, readingQuestion, soundKey, soundVariants } from '../../src/distractors'
import { soundHints } from '../../src/sound'
import { parseRow, type Level, type Word } from '../../src/data'

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

// ---- the shipped data: every reading-card word (k = S) of all five levels ----
const DATA: Word[] = ([5, 4, 3, 2, 1] as Level[]).flatMap((l) =>
  (JSON.parse(readFileSync(new URL(`../../public/data/n${l}.json`, import.meta.url), 'utf8')) as Parameters<typeof parseRow>[1][]).map((row, idx) =>
    parseRow(l, row, idx),
  ),
)
const CARDS = DATA.filter((w) => w.k === 'S')
const byId = (id: string) => DATA.find((w) => w.id === id)!
const coreOf = (w: string) => alternatives(w)[0] ?? w
/** every reading that is right for the word: its own, other entries of the same written word, the dictionary's (column x) */
const RIGHT = new Map<string, Set<string>>()
for (const p of DATA) {
  const core = coreOf(p.w)
  if (!RIGHT.has(core)) RIGHT.set(core, new Set())
  for (const r of [...alternatives(p.r || p.w), ...(p.x ?? '').split(' ').filter(Boolean)]) RIGHT.get(core)!.add(soundKey(r))
}
const rightReadings = (w: Word) => RIGHT.get(coreOf(w.w))!
/** small kana read as big: choices alike this way look like misprints of each other */
const glance = (s: string) => soundKey(s).replace(/[ゃゅょっ]/g, (c) => ({ ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ' })[c]!)
function editDistance(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return d[b.length]
}

describe('reading question over the whole word data', () => {
  // one showing of every reading-card word (a second pass would double the run time for little)
  const results = CARDS.map((w) => {
    const t = performance.now()
    const q = readingQuestion(w, DATA, `${w.id}:r|0`)
    return { w, q, ms: performance.now() - t }
  })

  it('every reading-card word gets four choices: none falls back in the shipped data', () => {
    expect(CARDS.length).toBeGreaterThan(3000)
    const short = results.filter(({ q }) => !q || q.choices.length < 4).map(({ w }) => `${w.w} ${w.r}`)
    expect(short).toEqual([])
  })

  it('the answer is there once; choices differ in sound and at a glance; every choice is a possible Japanese word', () => {
    for (const { w, q } of results) {
      const r = readingOf(w)
      expect(q!.choices[q!.answer], w.w).toBe(r)
      expect(q!.choices.filter((c) => c === r), w.w).toHaveLength(1)
      expect(new Set(q!.choices.map(soundKey)).size, q!.choices.join()).toBe(q!.choices.length)
      expect(new Set(q!.choices.map(glance)).size, q!.choices.join()).toBe(q!.choices.length)
      for (const c of q!.choices) expect(plausible(c, /[ぢづ]/.test(r)), `${w.w}: ${c}`).toBe(true)
    }
  })

  it('never offers another valid reading of the same word as a wrong choice (its other entries, the dictionary’s readings)', () => {
    const bad: string[] = []
    for (const { w, q } of results) {
      const right = rightReadings(w)
      q!.choices.forEach((c, i) => i !== q!.answer && right.has(soundKey(c)) && bad.push(`${w.w} ${w.r}: ${c}`))
    }
    expect(bad).toEqual([])
  })

  it('length gives nothing away: wrong choices are as long as the answer, and no choice is the only one of its length', () => {
    let wrong = 0
    let same = 0
    let singled = 0
    for (const { w, q } of results) {
      const m = moraCount(readingOf(w))
      q!.choices.forEach((c, i) => i !== q!.answer && (wrong++, moraCount(c) === m && same++))
      const per = new Map<number, number>()
      for (const c of q!.choices) per.set(moraCount(c), (per.get(moraCount(c)) ?? 0) + 1)
      if (per.size > 1 && [...per.values()].some((n) => n < 2)) singled++
    }
    // measured 99.9% and 0 (docs/plan/11); the old generator was at 65% and 67%
    expect(same / wrong).toBeGreaterThan(0.98)
    expect(singled / results.length).toBeLessThan(0.01)
  })

  it('the answer is not the choice in the middle of the others (the "closest to all" guess does no better than chance)', () => {
    let centre = 0
    for (const { q } of results) {
      const sums = q!.choices.map((a) => q!.choices.reduce((t, b) => t + editDistance(a, b), 0))
      if (sums.every((v, i) => i === q!.answer || v > sums[q!.answer])) centre++
    }
    // measured 0.0–0.1%; the old generator was at 85%
    expect(centre / results.length).toBeLessThan(0.02)
  })

  it('is the same for the same showing, also with the data loaded afresh, and stays fast', () => {
    const fresh = DATA.slice()
    for (const { w, q } of results.filter((_, i) => i % 7 === 0)) {
      expect(readingQuestion(w, DATA, `${w.id}:r|0`)).toEqual(q)
      expect(readingQuestion(w, fresh, `${w.id}:r|0`)).toEqual(q)
    }
    // the one-off index build lands on the first card; every other card is a millisecond or so (measured
    // median 0.8 ms, max 3.6 ms on a desktop). Generous bounds so a slow CI machine does not fail it.
    const rest = results.slice(1).map((r) => r.ms).sort((a, b) => a - b)
    expect(rest[Math.floor(rest.length / 2)]).toBeLessThan(10)
    expect(rest.at(-1)!).toBeLessThan(100)
  })

  it('short readings get plausible same-length confusions (気 き, 都 と, 胃 い)', () => {
    for (const [id, other] of [
      ['4-43', ['け', 'げ']], // 気: け/げ are readings of 気 itself
      ['4-208', ['つ', 'みやこ']], // 都
      ['3-1844', []], // 胃
    ] as [string, string[]][]) {
      const w = byId(id)
      for (let k = 0; k < 10; k++) {
        const q = readingQuestion(w, DATA, `${id}:r|${k}`)!
        expect(q.choices, w.w).toHaveLength(4)
        for (const c of q.choices) {
          expect(moraCount(c), `${w.w}: ${q.choices.join()}`).toBe(1)
          expect(other).not.toContain(c)
        }
      }
    }
    // a kanji's Korean reading leads to its confusions: 都 도 → ど, こ (고), ほ (보), ふ (부), しょ (소)
    const seen = new Set(Array.from({ length: 10 }, (_, k) => readingQuestion(byId('4-208'), DATA, `x${k}`)!.choices).flat())
    expect([...seen].filter((c) => ['ど', 'こ', 'ほ', 'ふ', 'しょ', 'ご'].includes(c)).length).toBeGreaterThanOrEqual(3)
  })

  it('compounds swap a kanji’s piece for a reading a Korean learner would mix up (産業 산업)', () => {
    const w = DATA.find((x) => x.w === '産業' && x.k === 'S')!
    expect(w.a).toBe('さん|ぎょう')
    const all = new Set(Array.from({ length: 12 }, (_, k) => readingQuestion(w, DATA, `${w.id}:r|${k}`)!.choices).flat())
    all.delete('さんぎょう')
    for (const c of all) expect(moraCount(c), c).toBe(4)
    // most wrong choices keep one kanji's piece and swap the other; 残業 ざんぎょう (잔, one sound from 산) comes up
    const kept = [...all].filter((c) => c.startsWith('さん') || c.endsWith('ぎょう'))
    expect(kept.length / all.size).toBeGreaterThan(0.5)
    expect(all).toContain('ざんぎょう')
  })

  it('日本 にほん never offers にっぽん; 重複 ちょうふく never じゅうふく; 末期 まっき never まつご', () => {
    for (const [w, r, not] of [
      ['日本', 'にほん', 'にっぽん'],
      ['重複', 'ちょうふく', 'じゅうふく'],
      ['末期', 'まっき', 'まつご'],
    ])
      for (let k = 0; k < 30; k++) {
        const word = DATA.find((x) => x.w === w && x.r === r)!
        expect(readingQuestion(word, DATA, `s${k}`)!.choices).not.toContain(not)
      }
  })
})

describe('reading question fallback', () => {
  it('with too few good wrong choices: three choices for two, a meaning card (null) for fewer', () => {
    expect(MIN_WRONG).toBe(2)
    // alone in its data, い has no sound change (a bare vowel takes no voicing, lengthening or っ)
    const i = word('胃', 'い', { a: 'い', sk: '위' })
    expect(readingQuestion(i, [i], 'x')).toBeNull()
    // は has two: ば and ぱ (voicing). (With a split, `a: 'は'`, even those would be refused: a piece must be
    // one the data has seen, and this data has seen only は.)
    const ha = word('派', 'は', { sk: '파' })
    expect(readingQuestion({ ...ha, a: 'は' }, [{ ...ha, a: 'は' }], 'x')).toBeNull()
    const q = readingQuestion(ha, [ha], 'x')!
    expect(q.choices).toHaveLength(3)
    expect(new Set(q.choices)).toEqual(new Set(['は', 'ば', 'ぱ']))
    expect(q.choices[q.answer]).toBe('は')
    // never junk to make up the numbers: what is shown passes the same checks as a full question
    for (const c of q.choices) expect(plausible(c)).toBe(true)
  })

  it('across the data, counts which words would fall back', () => {
    // the shipped data has none (docs/plan/11 §4); this keeps the count visible if the data changes
    const fallback = CARDS.filter((w) => readingQuestion(w, DATA, `${w.id}:r|1`)?.choices.length !== 4)
    expect(fallback.map((w) => w.w)).toEqual([])
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
