// Reading questions for the cognate fast-track (03 §3, 「읽기 오답 보기 생성」; measured in docs/plan/11): the
// word in kanji and four kana readings, one right. Wrong choices are what a Korean learner would mix up — per
// kanji, readings of kanji with the same or a near Korean reading and other readings of the same kanji; near
// sounds (long vowels, voicing, っ, ん, きょう/こう) — chosen as a set so that no shallow cue (length, the one
// in the middle, the only one fitting the Korean sound rules) gives the answer away. Everything is computed
// from the loaded word data and a seed, so the same showing of a card always gets the same choices in the
// same order.
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
  // one pass (it runs over every reading in the data): ぢ → じ, づ → ず, う after an o sound → お, い after an e sound → え
  let out = ''
  let prev = ''
  for (const c of s) {
    const v = VOWEL_OF.get(prev)
    out += c === 'ぢ' ? 'じ' : c === 'づ' ? 'ず' : c === 'う' && v === 'o' ? 'お' : c === 'い' && v === 'e' ? 'え' : c
    prev = c
  }
  return out
}

/**
 * Where a wrong choice came from: a sound change (long/short vowel, voicing, っ, small ゃゅょ, ん, きょう~こう),
 * a reading of a real word, another reading of the same kanji, or a reading of a kanji with the same or a
 * near Korean reading.
 */
export type Rule = 'long' | 'short' | 'voice' | 'sokuon' | 'youon' | 'nasal' | 'near' | 'word' | 'kanji' | 'hanja'

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
  /** the kana readings in display order: four, or three when only two good wrong choices exist */
  choices: string[]
  /** index of the right one */
  answer: number
  /** where each choice came from ('answer' for the right one) */
  rules: (Rule | 'answer')[]
}

/** Fewest wrong choices worth showing. With fewer, the card is asked as an ordinary meaning card instead. */
export const MIN_WRONG = 2

/** a kanji (CJK ideographs, extension A, compatibility ideographs) or 々 */
const isHan = (c: string) => {
  const u = c.codePointAt(0) ?? 0
  return (u >= 0x4e00 && u <= 0x9fff) || (u >= 0x3400 && u <= 0x4dbf) || (u >= 0xf900 && u <= 0xfaff) || (u >= 0x20000 && u <= 0x2ffff) || u === 0x3005
}

/** Morae in a kana string: small ゃゅょぁぃぅぇぉ join the kana before them; っ, ん and long vowels count. */
export const moraCount = (s: string) => {
  let n = 0
  for (const c of s) if (!isSmall(c)) n++
  return n
}

/** What the eye takes in at a glance: small ゃゅょっ read as big. Two choices alike this way look like a misprint. */
const glance = (s: string) => soundKey(s).replace(/[ゃゅょっ]/g, (c) => ({ ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ' })[c] ?? c)

// ---- Korean syllables (the `sk` column: one hangul syllable per kanji) ----
const jamo = (syl: string): [number, number, number] | null => {
  const c = syl.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28] : null
}
/**
 * How a Korean final consonant shows in the Japanese on'yomi (02 F4, src/sound.ts): ㄴ·ㅁ → ん, ㅇ → う·い,
 * ㄱ → く·き, ㄹ → つ·ち, ㅂ → う, with っ where a closing syllable assimilates; no final → none of those.
 */
function fitsKorean(seg: string, syl: string): boolean {
  const t = jamo(syl)?.[2]
  if (t === undefined) return true
  const end = seg[seg.length - 1]
  if (t === 0) return seg.length === 1 || !'んくきつちっ'.includes(end)
  if (t === 4 || t === 16) return end === 'ん'
  if (t === 21) return end === 'う' || end === 'い'
  if (t === 1) return 'くきっ'.includes(end)
  if (t === 8) return 'つちっ'.includes(end)
  if (t === 17) return end === 'う' || end === 'っ'
  return true
}

// ---- what the loaded data says about kanji readings, built once per pool ----
interface Entry {
  r: string
  level: number
  rt: string
}
interface Index {
  /** every per-kanji on'yomi segment in the data's reading splits (column `a`) → how many words use it */
  segs: Map<string, number>
  /** kanji → its on'yomi segments */
  onOf: Map<string, Map<string, number>>
  /** kanji → every piece the splits give it, assimilated っ forms included (for splitting words the data left unsplit) */
  pieces: Map<string, Map<string, number>>
  /** Korean syllable → on'yomi segments of the kanji read with it (産 산 → さん) */
  byKo: Map<string, Map<string, number>>
  /** Korean syllable → syllables one sound away and how close (filled on demand) */
  near: Map<string, [string, number][]>
  /** written form → its entries (an entry's reading is right for every entry of the same word) */
  byCore: Map<string, Word[]>
  /** kanji → entries written with it */
  byKanji: Map<string, Word[]>
  /** every reading in the data (sound keys): a wrong choice that is a real word is harder to rule out */
  real: Set<string>
  /** level → mora count → readings of words written with kanji */
  byMora: Map<number, Map<number, Entry[]>>
}
const INDEX = new WeakMap<Word[], Index>()
const bump = <K, V>(m: Map<K, Map<V, number>>, k: K, v: V) => {
  let inner = m.get(k)
  if (!inner) m.set(k, (inner = new Map()))
  inner.set(v, (inner.get(v) ?? 0) + 1)
}
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k)
  if (a) a.push(v)
  else m.set(k, [v])
}

/** The per-kanji split of a word's reading, when the data has one that fits its written form. */
function splitOf(w: Pick<Word, 'w' | 'r' | 'a' | 'sk'>, reading = readingOf(w)) {
  if (!w.a) return null
  const kanji = [...coreOf(w.w)]
  const segs = w.a.split('|')
  if (!kanji.every(isHan) || kanji.includes('々') || segs.length !== kanji.length || segs.join('') !== reading) return null
  const ko = [...(w.sk || '')]
  return { kanji, segs, ko: ko.length === kanji.length && ko.every((c) => jamo(c)) ? ko : null }
}

function indexOf(pool: Word[]): Index {
  let ix = INDEX.get(pool)
  if (ix) return ix
  ix = { segs: new Map(), onOf: new Map(), pieces: new Map(), byKo: new Map(), near: new Map(), byCore: new Map(), byKanji: new Map(), byMora: new Map(), real: new Set() }
  for (const w of pool) {
    const core = coreOf(w.w)
    push(ix.byCore, core, w)
    const alts = alternatives(w.r || w.w)
    for (const r of alts) ix.real.add(soundKey(r))
    const r = alts[0]
    if (!w.r || !r) continue
    const han = [...new Set([...core].filter(isHan))]
    for (const k of han) push(ix.byKanji, k, w)
    if (han.length) {
      let byLevel = ix.byMora.get(w.level)
      if (!byLevel) ix.byMora.set(w.level, (byLevel = new Map()))
      push(byLevel, moraCount(r), { r, level: w.level, rt: w.rt })
    }
    const sp = splitOf(w, r)
    if (!sp) continue
    sp.segs.forEach((seg, i) => {
      ix.segs.set(seg, (ix.segs.get(seg) ?? 0) + 1)
      bump(ix.pieces, sp.kanji[i], seg)
      // an assimilated がっ is a sound change, not a reading of its own
      if (seg.endsWith('っ')) return
      bump(ix.onOf, sp.kanji[i], seg)
      if (sp.ko) bump(ix.byKo, sp.ko[i], seg)
    })
  }
  INDEX.set(pool, ix)
  return ix
}

/**
 * A split for a word the data left unsplit (計画 けいかく, read with する in the data): the reading cut into
 * the pieces the data gives each kanji elsewhere, when there is exactly one way to do it.
 */
function splitAgain(ix: Index, w: Pick<Word, 'w' | 'sk'>, reading: string) {
  const kanji = [...coreOf(w.w)]
  if (!kanji.length || !kanji.every((c) => isHan(c) && c !== '々')) return null
  const found: string[][] = []
  const go = (i: number, pos: number, segs: string[]) => {
    if (found.length > 1) return
    if (i === kanji.length) {
      if (pos === reading.length) found.push(segs)
      return
    }
    for (const r of ix.pieces.get(kanji[i])?.keys() ?? []) if (reading.startsWith(r, pos) && (!r.endsWith('っ') || i < kanji.length - 1)) go(i + 1, pos + r.length, [...segs, r])
  }
  go(0, 0, [])
  if (found.length !== 1) return null
  const ko = [...(w.sk || '')]
  return { kanji, segs: found[0], ko: ko.length === kanji.length && ko.every((c) => jamo(c)) ? ko : null }
}

/** Korean syllables one jamo away that the data has readings for: a different final is the closest slip. */
function nearSyllables(ix: Index, syl: string): [string, number][] {
  let out = ix.near.get(syl)
  if (out) return out
  out = []
  const a = jamo(syl)
  if (a)
    for (const k of ix.byKo.keys()) {
      const b = jamo(k)
      if (!b || k === syl) continue
      const diff = [0, 1, 2].filter((i) => a[i] !== b[i])
      if (diff.length === 1) out.push([k, diff[0] === 2 ? 2.4 : diff[0] === 0 ? 2 : 1.8])
    }
  ix.near.set(syl, out)
  return out
}

/** Whether `s` cuts into `n` pieces that each pass `ok` (pieces of 1–4 kana). */
function cuts(s: string, n: number, ok: (piece: string, i: number) => boolean): boolean {
  const seen = new Set<number>()
  const go = (pos: number, i: number): boolean => {
    if (i === n) return pos === s.length
    const key = pos * 32 + i
    if (seen.has(key)) return false
    seen.add(key)
    for (let e = pos + 1; e <= Math.min(s.length, pos + 4); e++) if (ok(s.slice(pos, e), i) && go(e, i + 1)) return true
    return false
  }
  return go(0, 0)
}

/** i-row kana that take a small ょ/ゅ, and the o-row kana a learner hears in their place (きょう ~ こう) */
const YOON_OF: Record<string, string> = { こ: 'き', ご: 'ぎ', そ: 'し', ぞ: 'じ', と: 'ち', の: 'に', ほ: 'ひ', ぼ: 'び', ぽ: 'ぴ', も: 'み', ろ: 'り' }
const PLAIN_OF = Object.fromEntries(Object.entries(YOON_OF).map(([a, b]) => [b, a]))

interface Candidate {
  x: string
  q: number
  rule: Rule
  /** the per-kanji pieces, when the candidate was built from the answer's split */
  segs?: string[]
  /** a reading some word in the data has */
  real?: boolean
}

/**
 * The question for a reading card, or null when the word cannot get MIN_WRONG good wrong choices (then it
 * is asked as an ordinary meaning card). `pool`: all the loaded word data. `seed`: the card id and how many
 * times it has been answered, so a re-render or an undo shows the same question and the next review a new mix.
 *
 * Wrong choices are confusions a Korean learner makes, not random kana: for a word read per kanji, each
 * kanji's piece is swapped for another reading of the same kanji, a reading of a kanji with the same or a
 * one-sound-away Korean reading (기 → き, 개 → かい), or a near sound (voicing, long vowel, っ, ん, きょう/こう).
 * Other words get sound changes and readings of similar words. A wrong choice is never a reading the word
 * really has (its other entries, the dictionary's other readings in column `x`). Choices are picked as a set:
 * where possible all the same length or two and two, the answer not the one in the middle of the others, and
 * when the answer follows the Korean sound rules, not the only one that does.
 */
export function readingQuestion(word: Word, pool: Word[], seed: string): ReadingQuestion | null {
  const full = readingOf(word)
  const rnd = seeded(`${seed}|${full}`)
  const ix = indexOf(pool)
  const core = coreOf(word.w)
  // a reading given with する (計画 けいかくする) is asked on the noun; every choice keeps the する
  const suffix = full.endsWith('する') && full.length > 3 && !core.endsWith('する') ? 'する' : ''
  const answer = full.slice(0, full.length - suffix.length)
  const bare = (r: string) => (suffix && r.endsWith(suffix) ? r.slice(0, -suffix.length) : r)
  const m = moraCount(answer)
  const sp = splitOf(word, answer) ?? splitAgain(ix, word, answer)

  // readings that are right for this written word: its own, other entries of it, the dictionary's others
  const right = new Set<string>()
  const addRight = (w: Word) => {
    for (const r of alternatives(w.r || w.w)) right.add(soundKey(r))
    for (const r of (w.x ?? '').split(' ')) if (r) right.add(soundKey(r))
  }
  addRight(word)
  for (const p of ix.byCore.get(core) ?? []) addRight(p)
  // a one-kanji word may be read with any reading of its kanji (気 き / け): none of them is a safe wrong choice
  if (sp?.kanji.length === 1) for (const r of ix.onOf.get(sp.kanji[0])?.keys() ?? []) right.add(soundKey(r))

  const dz = /[ぢづ]/.test(answer)
  const shaped = (x: string) => !sp || cuts(x, sp.segs.length, (piece) => ix.segs.has(piece))
  const fitsAll = (segs: string[]) => !!sp?.ko && segs.every((s, i) => fitsKorean(s, sp.ko![i]))
  const fitsSome = (x: string) => !!sp?.ko && cuts(x, sp.segs.length, (piece, i) => ix.segs.has(piece) && fitsKorean(piece, sp.ko![i]))
  const answerFits = !!sp && fitsAll(sp.segs)

  const best = new Map<string, Candidate>()
  const offer = (c: Candidate) => {
    const { x } = c
    if (!x || x === answer || Math.abs(moraCount(x) - m) > 1) return
    const key = glance(x)
    const cur = best.get(key)
    if (cur && cur.q >= c.q) return
    if (!plausible(x, dz) || right.has(soundKey(x)) || right.has(soundKey(x + suffix)) || key === glance(answer) || !shaped(x)) return
    best.set(key, c)
  }

  if (sp) {
    // ---- per-kanji pieces: other readings for each kanji's piece ----
    const n = sp.segs.length
    const alts = sp.segs.map((seg, i) => {
      const out = new Map<string, { q: number; rule: Rule }>()
      const add = (r: string, q: number, rule: Rule) => {
        if (!r || r === seg || !ix.segs.has(r)) return
        q += Math.min(0.6, Math.log10(1 + (ix.segs.get(r) ?? 0)) * 0.3) + rnd() * 0.6
        const cur = out.get(r)
        if (!cur || cur.q < q) out.set(r, { q, rule })
      }
      // a piece assimilated to っ (学校 がっ|こう) is offered unassimilated (がく), and a substitute that
      // closes in く/き/つ/ち takes the っ the same way
      const closing = seg.endsWith('っ')
      const fit = (r: string) => (closing && /[くきつち]$/.test(r) ? r.slice(0, -1) + 'っ' : r)
      if (closing) for (const c of 'くきつち') add(seg.slice(0, -1) + c, 2, 'sokuon')
      const top = (mp: Map<string, number> | undefined, k: number) => [...(mp ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, k)
      if (n > 1) for (const [r] of top(ix.onOf.get(sp.kanji[i]), 4)) add(fit(r), 3, 'kanji')
      if (sp.ko) {
        for (const [r] of top(ix.byKo.get(sp.ko[i]), 4)) add(fit(r), 3, 'hanja')
        for (const [syl, w] of nearSyllables(ix, sp.ko[i])) for (const [r] of top(ix.byKo.get(syl), 2)) add(fit(r), w, 'hanja')
      }
      // near sounds of the piece itself
      for (const [v, rule] of soundVariants(seg)) if (rule !== 'sokuon') add(v, rule === 'youon' ? 0.4 : 2, rule)
      const [c0, c1, c2] = seg
      if (YOON_OF[c0]) add(YOON_OF[c0] + 'ょ' + seg.slice(1), 2, 'near') // こう → きょう
      if (PLAIN_OF[c0] && (c1 === 'ょ' || c1 === 'ゅ')) add(PLAIN_OF[c0] + seg.slice(2), 2, 'near') // きょう → こう
      if (c1 === 'ょ' && c2 === 'う') add(c0 + 'ゅう' + seg.slice(3), 2, 'near') // きょう → きゅう
      if (c1 === 'ゅ' && c2 === 'う') add(c0 + 'ょう' + seg.slice(3), 2, 'near')
      if (!closing) {
        if (seg.endsWith('ん')) add(seg.slice(0, -1), 1.6, 'nasal')
        else if (seg.length <= 2 && !/[うい]$/.test(seg)) add(seg + 'ん', 1.6, 'nasal')
      }
      return [...out].sort((a, b) => b[1].q - a[1].q).slice(0, n === 1 ? 14 : 5)
    })
    const make = (changes: [number, string][]) => sp.segs.map((s, i) => changes.find(([j]) => j === i)?.[1] ?? s)
    const fitBonus = (segs: string[]) => (answerFits && fitsAll(segs) ? 0.7 : 0)
    alts.forEach((list, i) =>
      list.forEach(([r, a]) => {
        const segs = make([[i, r]])
        offer({ x: segs.join(''), q: a.q + fitBonus(segs), rule: a.rule, segs })
      }),
    )
    // two pieces changed at once: wrong choices that are near each other as well as near the answer
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (const [ri, ai] of alts[i].slice(0, 3))
          for (const [rj, aj] of alts[j].slice(0, 3)) {
            const segs = make([
              [i, ri],
              [j, rj],
            ])
            offer({ x: segs.join(''), q: (ai.q + aj.q) / 2 - 0.2 + fitBonus(segs), rule: ai.rule, segs })
          }
  }

  // ---- sound changes of the whole reading (and of those, so wrong choices can be near each other) ----
  const firstStep = soundVariants(answer)
  for (const [v, rule] of firstStep) offer({ x: v, q: (rule === 'youon' ? 0.3 : sp ? 1.4 : 2) + rnd() * 0.6, rule })
  if (!sp)
    for (const [v] of firstStep.slice(0, 6))
      for (const [v2, rule] of soundVariants(v)) if (rule !== 'youon') offer({ x: v2, q: 1.2 + rnd() * 0.6, rule })

  // ---- readings of real words: sharing a kanji, or the same length at the same level ----
  const han = [...new Set([...core].filter(isHan))]
  for (const k of han)
    for (const p of ix.byKanji.get(k) ?? [])
      if (coreOf(p.w) !== core) {
        const r = bare(readingOf(p))
        offer({ x: r, q: 1.8 + (p.level === word.level ? 0.3 : 0) + (r[0] === answer[0] ? 0.3 : 0) + rnd() * 0.6, rule: 'word' })
      }
  const same = ix.byMora.get(word.level)?.get(m) ?? []
  if (same.length) {
    const start = Math.floor(rnd() * same.length)
    for (let k = 0; k < Math.min(60, same.length); k++) {
      const e = same[(start + k) % same.length]
      const q = (sp ? 0.6 : 1) + (e.r[0] === answer[0] ? 0.5 : 0) + (e.rt === word.rt ? 0.4 : 0) + (e.r.at(-1) === answer.at(-1) ? 0.3 : 0) + rnd() * 0.4
      offer({ x: bare(e.r), q, rule: 'word' })
    }
  }

  // ---- choose the set ----
  const cands = [...best.values()]
    .map((c) => {
      const real = ix.real.has(soundKey(c.x + suffix)) || ix.real.has(soundKey(c.x))
      return { ...c, real, q: c.q + (moraCount(c.x) === m ? 2 : 0) + (answerFits && !c.segs && fitsSome(c.x) ? 0.5 : 0) + (real ? 0.4 : 0) }
    })
    .sort((a, b) => b.q - a.q)
    .slice(0, 12)
  if (cands.length < MIN_WRONG) return null
  const want = Math.min(3, cands.length)
  const xs = [answer, ...cands.map((c) => c.x)]
  const ms = xs.map(moraCount)
  const fits = [answerFits, ...cands.map((c) => answerFits && (c.segs ? fitsAll(c.segs) : fitsSome(c.x)))]
  const dist = xs.map((a) => xs.map((b) => editDistance(a, b)))
  const anyReal = cands.some((c) => c.real)
  let pick: number[] = []
  let top = -Infinity
  const score = (set: number[]) => {
    const all = [0, ...set]
    let s = set.reduce((t, i) => t + cands[i - 1].q, 0)
    // length gives nothing away: every length shared by at least two choices (or all one length)
    const per = new Map<number, number>()
    for (const i of all) per.set(ms[i], (per.get(ms[i]) ?? 0) + 1)
    s += per.size === 1 || [...per.values()].every((c) => c >= 2) ? 4 : -4
    // the answer is not the one closest to all the others
    const sums = all.map((i) => all.reduce((t, j) => t + dist[i][j], 0))
    if (sums.slice(1).every((v) => v > sums[0])) s -= 3
    // the Korean sound rules alone do not single out the answer
    if (answerFits && !set.some((i) => fits[i])) s -= 2.5
    // nor does "the only one that is a real word"
    if (anyReal && !set.some((i) => cands[i - 1].real)) s -= 1.5
    s += new Set(set.map((i) => cands[i - 1].rule)).size * 0.3
    return s
  }
  const k = cands.length
  if (want === 3) {
    for (let a = 1; a <= k; a++)
      for (let b = a + 1; b <= k; b++)
        for (let c = b + 1; c <= k; c++) {
          const s = score([a, b, c])
          if (s > top) (top = s), (pick = [a, b, c])
        }
  } else
    for (let a = 1; a <= k; a++)
      for (let b = a + 1; b <= k; b++) {
        const s = score([a, b])
        if (s > top) (top = s), (pick = [a, b])
      }

  const all = shuffled([[full, 'answer'] as [string, Rule | 'answer'], ...pick.map((i) => [cands[i - 1].x + suffix, cands[i - 1].rule] as [string, Rule])], rnd)
  return { choices: all.map(([x]) => x), answer: all.findIndex(([, r]) => r === 'answer'), rules: all.map(([, r]) => r) }
}

function editDistance(a: string, b: string): number {
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
