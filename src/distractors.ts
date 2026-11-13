// Reading questions for the cognate fast-track (03 §3, 「읽기 오답 보기 생성」): the word in kanji and four
// kana readings, one right. Wrong choices come from Japanese sound rules aimed at what Korean learners mix
// up — long vowels, voicing, the small っ, small ゃゅょ — plus one reading of a same-level word of similar
// length. Everything is computed from the loaded word data and a seed, so the same showing of a card always
// gets the same choices in the same order.
import type { Word } from './data'

/** The kana written for `w`: its first reading without ～ and notes such as "(する)". */
export function readingOf(w: Pick<Word, 'w' | 'r'>): string {
  return alternatives(w.r || w.w)[0] ?? ''
}

/** Every reading an entry gives ("こうよう もみじ", "かんじる; かんずる"), cleaned. */
export function alternatives(s: string): string[] {
  return s
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .split(/[;；、,，\s]+/)
    .map((x) => x.replace(/[～〜~]/g, '').trim())
    .filter(Boolean)
}

/** The written form an entry is about, for finding other entries of the same word: first form, no ～ or notes. */
const coreOf = (w: string) => alternatives(w)[0] ?? w

const SMALL = 'ゃゅょぁぃぅぇぉ'
const isSmall = (c: string) => SMALL.includes(c)
const VOWEL_OF = (() => {
  const rows: [string, string][] = [
    ['a', 'あかさたなはまやらわがざだばぱ'],
    ['i', 'いきしちにひみりぎじぢびぴ'],
    ['u', 'うくすつぬふむゆるぐずづぶぷ'],
    ['e', 'えけせてねへめれげぜでべぺ'],
    ['o', 'おこそとのほもよろをごぞどぼぽ'],
  ]
  const m = new Map<string, string>()
  for (const [v, cs] of rows) for (const c of cs) m.set(c, v)
  for (const [c, v] of [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o'], ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'u'], ['ぇ', 'e'], ['ぉ', 'o']]) m.set(c, v)
  return m
})()
const VOICED: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
}
const UNVOICED = Object.fromEntries(Object.entries(VOICED).map(([a, b]) => [b, a]))
const HALF: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ', ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ' }
/** kana that can follow っ in a native or Sino word: k, s, t, p rows */
const AFTER_SOKUON = new Set([...'かきくけこさしすせそたちつてとぱぴぷぺぽ'])
/** bare vowels: a mora of its own that does not lengthen or take っ */
const PURE = new Set([...'あいうえお'])
const LENGTHENER = new Set([...'うい'])
const BIG_OF: Record<string, string> = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' }
const SMALL_OF: Record<string, string> = { や: 'ゃ', ゆ: 'ゅ', よ: 'ょ' }

/** Morae as [start, end) index pairs: a kana with a following small ゃゅょ counts as one. */
function morae(s: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < s.length; i++) {
    if (isSmall(s[i]) && out.length) out[out.length - 1][1] = i + 1
    else out.push([i, i + 1])
  }
  return out
}

/** Whether a kana string could be a Japanese word: no leading っ/ん/ー/small kana, っ only before k/s/t/p. */
export function plausible(s: string, allowDz = false): boolean {
  // ぢ/づ only in words that have them (つづく): elsewhere they look like misprints, not readings
  if (!s || /^[っんーゃゅょぁぃぅぇぉ]/.test(s) || /っ$/.test(s) || (!allowDz && /[ぢづ]/.test(s))) return false
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'っ' && !AFTER_SOKUON.has(s[i + 1])) return false
    if ('ゃゅょ'.includes(s[i]) && VOWEL_OF.get(s[i - 1]) !== 'i') return false
    if (s[i] === s[i + 1] && 'っん'.includes(s[i])) return false
  }
  return true
}

/**
 * Two spellings of one sound count as the same reading: ぢ/じ, づ/ず, and a long o or e written
 * with お/う or え/い (おおきい ~ おうきい). Distractors must differ from the answer in sound, not just spelling.
 */
export function soundKey(s: string): string {
  let out = s.replace(/ぢ/g, 'じ').replace(/づ/g, 'ず')
  out = out.replace(/(.)う/g, (m, c) => (VOWEL_OF.get(c) === 'o' ? c + 'お' : m))
  out = out.replace(/(.)い/g, (m, c) => (VOWEL_OF.get(c) === 'e' ? c + 'え' : m))
  return out
}

export type Rule = 'long' | 'short' | 'voice' | 'sokuon' | 'youon' | 'word'

/** Every one-step sound change of `s` the rules allow, with the rule that made it. */
export function soundVariants(s: string): [string, Rule][] {
  const out: [string, Rule][] = []
  const at = (i: number, del: number, ins: string) => s.slice(0, i) + ins + s.slice(i + del)
  const ms = morae(s)
  for (let m = 0; m < ms.length; m++) {
    const [a, b] = ms[m]
    const last = s[b - 1]
    const v = VOWEL_OF.get(last)
    const next = s[b]
    const c = s[a]
    const prev = s[a - 1]
    // a Sino syllable's second mora (がく, しつ, こう, せい, しん): ending a syllable, it is never voiced
    const closes = m > 0 && !PURE.has(prev) && 'くきつち'.includes(c) && b - a === 1
    // long vowel: add う after an o mora or a ゅ mora, い after an e mora — not inside a syllable like がく
    // (がくうし) and not on a bare vowel (ろううすい); or take an existing lengthener away
    const canLengthen = !PURE.has(c) && !'くきつちっ'.includes(next ?? '') && next !== 'ー'
    if (canLengthen && (v === 'o' || (v === 'u' && s[b - 1] === 'ゅ')) && next !== 'う' && next !== 'お') out.push([at(b, 0, 'う'), 'long'])
    if (canLengthen && v === 'e' && next !== 'い' && next !== 'え') out.push([at(b, 0, 'い'), 'long'])
    if (!PURE.has(c) && (((v === 'o' || v === 'u') && next === 'う') || (v === 'e' && next === 'い'))) out.push([at(b, 1, ''), 'short'])
    // voicing: か↔が, は↔ば↔ぱ (not on a syllable-closing く/き/つ/ち)
    if (!closes) {
      if (VOICED[c]) out.push([at(a, 1, VOICED[c]), 'voice'])
      if (UNVOICED[c]) out.push([at(a, 1, UNVOICED[c]), 'voice'])
      if (HALF[c]) out.push([at(a, 1, HALF[c]), 'voice'])
    }
    // small っ: take it away; a closing く/き/つ/ち before k/s/t/p becomes っ (がくし → がっし); or one is
    // added between two plain morae (かき → かっき), never after a long vowel, ん or a closing mora
    if (c === 'っ') out.push([at(a, 1, ''), 'sokuon'])
    else if (closes && AFTER_SOKUON.has(next ?? '')) out.push([at(a, 1, 'っ'), 'sokuon'])
    else if (m > 0 && !closes && AFTER_SOKUON.has(c) && !PURE.has(prev) && !'っんーくきつち'.includes(prev) && !(m > 1 && LENGTHENER.has(prev))) out.push([at(a, 0, 'っ'), 'sokuon'])
    // small ゃゅょ ↔ big やゆよ (きょ ↔ きよ)
    if (b - a === 2 && BIG_OF[s[a + 1]]) out.push([at(a + 1, 1, BIG_OF[s[a + 1]]), 'youon'])
    if (SMALL_OF[c] && m > 0 && VOWEL_OF.get(s[a - 1]) === 'i' && b - a === 1 && !isSmall(s[a - 1])) out.push([at(a, 1, SMALL_OF[c]), 'youon'])
  }
  return out
}

/** Small deterministic generator (mulberry32) seeded from a string. */
export function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface ReadingQuestion {
  /** four kana readings in display order */
  choices: string[]
  /** index of the right one */
  answer: number
  /** the rule behind each choice ('answer' for the right one) */
  rules: (Rule | 'answer')[]
}

const isHan = (c: string) => /[\p{Script=Han}々]/u.test(c)

/**
 * The question for a reading card. `pool`: the word data loaded (the word's own level supplies the
 * same-level reading; every level is searched for other entries of the same written word, whose readings are
 * right answers too and never shown as wrong). `seed` decides the choices: the card id and how many times the
 * card has been answered, so a re-render or an undo shows the same question and the next review a new mix.
 */
export function readingQuestion(word: Word, pool: Word[], seed: string): ReadingQuestion {
  const answer = readingOf(word)
  const rnd = seeded(`${seed}|${answer}`)
  // readings that are right for this written word: its own alternatives and other entries of the same word
  const core = coreOf(word.w)
  const right = new Set<string>(alternatives(word.r || word.w).map(soundKey))
  for (const p of pool) if (coreOf(p.w) === core && p.r) for (const r of alternatives(p.r)) right.add(soundKey(r))
  const taken = new Set<string>([soundKey(answer)])
  const dz = /[ぢづ]/.test(answer)
  const ok = (x: string) => plausible(x, dz) && !right.has(soundKey(x)) && !taken.has(soundKey(x))

  // sound-rule variants: one per rule kind first (so the wrong choices test different things), then any
  const variants = shuffled(soundVariants(answer), rnd).filter(([x]) => ok(x))
  const picked: [string, Rule][] = []
  const kinds = new Set<Rule>()
  for (const v of variants)
    if (picked.length < 2 && !kinds.has(v[1]) && ok(v[0])) {
      picked.push(v)
      kinds.add(v[1])
      taken.add(soundKey(v[0]))
    }
  // one reading of a same-level word: sharing a kanji or the first kana, of about the same length
  const chars = new Set([...core].filter(isHan))
  const scored = pool
    .filter((p) => p.level === word.level && p.id !== word.id && p.r)
    .map((p) => [readingOf(p), p] as const)
    .filter(([r]) => r.length >= 2 && Math.abs(r.length - answer.length) <= (answer.length <= 3 ? 0 : 1) && ok(r))
    .map(([r, p]) => [r, ([...coreOf(p.w)].some((c) => chars.has(c)) ? 2 : 0) + (r[0] === answer[0] ? 1 : 0) + (r.length === answer.length ? 1 : 0)] as const)
  const best = Math.max(-1, ...scored.map(([, sc]) => sc))
  const top = shuffled(
    scored.filter(([, sc]) => sc === best).map(([r]) => r),
    rnd,
  )
  if (top.length) {
    picked.push([top[0], 'word'])
    taken.add(soundKey(top[0]))
  }
  // fill up from the remaining variants, then from other same-level readings
  for (const v of variants) if (picked.length < 3 && ok(v[0])) (picked.push(v), taken.add(soundKey(v[0])))
  for (const [r] of shuffled(scored.slice(), rnd)) if (picked.length < 3 && ok(r)) (picked.push([r, 'word']), taken.add(soundKey(r)))
  // a tiny pool (never the real data): any loaded reading, nearest length first
  if (picked.length < 3)
    for (const r of shuffled(pool.filter((p) => p.r).map(readingOf), rnd).sort((x, y) => Math.abs(x.length - answer.length) - Math.abs(y.length - answer.length)))
      if (picked.length < 3 && r.length >= 2 && ok(r)) (picked.push([r, 'word']), taken.add(soundKey(r)))

  const all = shuffled([[answer, 'answer'] as [string, Rule | 'answer'], ...picked.slice(0, 3)], rnd)
  return { choices: all.map(([x]) => x), answer: all.findIndex(([, r]) => r === 'answer'), rules: all.map(([, r]) => r) }
}
