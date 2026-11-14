// Shared helpers for the S/F tag audit (docs/plan/12-tag-audit.md). Read-only: nothing here writes tag data.
import { readFileSync, readdirSync } from 'node:fs'
import { levelWords, root, LEVELS } from '../enrich/words.mjs'
import { isHan, isHira, isKata } from '../enrich/forms.mjs'

export { root, LEVELS, isHan }
export const AUDIT_DIR = `${root}data/tags/audit`

// ---------- words + tags ----------
/** Every word with its labelled tag: { id, level, chunk, expr, reading, ko, en, core, coreReading, affix, k, sk, ff, rt }. */
export function loadTagged() {
  const tags = {}
  for (const f of readdirSync(`${root}data/tags`).filter((f) => /^n[1-5]-\d+\.json$/.test(f))) {
    const d = JSON.parse(readFileSync(`${root}data/tags/${f}`, 'utf8'))
    for (const [id, t] of Object.entries(d)) tags[id] = { ...t, chunk: f.replace(/\.json$/, '') }
  }
  const out = []
  for (const n of LEVELS)
    for (const w of levelWords(n)) {
      const t = tags[w.id] ?? {}
      out.push({
        id: w.id, level: n, chunk: t.chunk ?? '', expr: w.expr, reading: w.reading, ko: w.ko, en: w.en,
        core: w.core, coreReading: w.coreReading, affix: w.affix,
        k: t.k ?? '', sk: t.sk ?? '', ff: t.ff ?? '', rt: t.rt ?? '',
      })
    }
  return out
}

/** Sampling stratum by shape of the core form: kana (any kana besides 々), 1, 2 or 3+ kanji. */
export function shapeOf(core) {
  const chars = [...core]
  if (chars.some((c) => (isHira(c) || isKata(c)) && c !== 'ー' && c !== '・')) return 'kana'
  const n = chars.filter(isHan).length
  return n <= 1 ? '1' : n === 2 ? '2' : '3+'
}

// ---------- Hangul ----------
const S0 = 0xac00
export const jamo = (s) => {
  const c = s.charCodeAt(0) - S0
  return { l: Math.floor(c / 588), v: Math.floor((c % 588) / 28), t: c % 28 }
}
export const syl = ({ l, v, t }) => String.fromCharCode(S0 + l * 588 + v * 28 + t)
const Y_VOWELS = new Set([2, 3, 6, 7, 12, 17, 20]) // ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ

/** 두음법칙 for one syllable: 료→요, 로→노, 녀→여, 리→이. Returns the syllable unchanged when it does not apply. */
export function dueum(s) {
  const j = jamo(s)
  if (j.l === 5) j.l = Y_VOWELS.has(j.v) ? 11 : 2
  else if (j.l === 2 && Y_VOWELS.has(j.v)) j.l = 11
  return syl(j)
}

// Unihan kKorean (Yale-type romanisation) -> Hangul
const INI = { '': 11, K: 0, KK: 1, N: 2, T: 3, TT: 4, L: 5, M: 6, P: 7, PP: 8, S: 9, SS: 10, C: 12, CC: 13, CH: 14, KH: 15, TH: 16, PH: 17, H: 18 }
const VOW = { A: 0, AY: 1, YA: 2, YAY: 3, E: 4, EY: 5, YE: 6, YEY: 7, O: 8, WA: 9, WAY: 10, OY: 11, YO: 12, WU: 13, WE: 14, WEY: 15, WI: 16, YU: 17, U: 18, UY: 19, I: 20 }
const FIN = { '': 0, K: 1, N: 4, T: 7, L: 8, M: 16, P: 17, S: 19, NG: 21 }
const RX = new RegExp(`^(${Object.keys(INI).filter(Boolean).sort((a, b) => b.length - a.length).join('|')})?(${Object.keys(VOW).sort((a, b) => b.length - a.length).join('|')})(${Object.keys(FIN).filter(Boolean).sort((a, b) => b.length - a.length).join('|')})?$`)
export function yaleToHangul(tok) {
  const m = RX.exec(tok)
  if (!m) return null
  return syl({ l: INI[m[1] ?? ''], v: VOW[m[2]], t: FIN[m[3] ?? ''] })
}

// ---------- per-kanji readings ----------
/**
 * Map char -> { uni: [kHangul], edu: [kHangul marked E], yale: [kKorean as Hangul], kd: [KANJIDIC korean_h],
 *               table: [data/hanja/kanji.tsv ko], vars: {variantChar: [kHangul]} }
 */
export function loadReadings() {
  const t = new Map()
  const sp = (s) => (s ? s.split(/\s+/).filter(Boolean) : [])
  for (const line of readFileSync(`${root}data/hanja/kanji.tsv`, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [ch, ku, kk] = line.split('\t')
    t.set(ch, { uni: [], edu: [], yale: [], kd: [], table: [...sp(ku), ...sp(kk)], vars: {} })
  }
  for (const line of readFileSync(`${AUDIT_DIR}/hanja-readings.tsv`, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [ch, hangul, korean, kd, , varH] = line.split('\t')
    const e = t.get(ch) ?? { uni: [], edu: [], yale: [], kd: [], table: [], vars: {} }
    for (const x of sp(hangul)) {
      const [h, flag = ''] = x.split(':')
      e.uni.push(h)
      if (flag.includes('E')) e.edu.push(h)
    }
    e.yale = sp(korean).map(yaleToHangul).filter(Boolean)
    e.kd = sp(kd)
    for (const x of sp(varH)) {
      const [v, rs] = x.split('=')
      e.vars[v] = rs.split(',').map((r) => r.split(':')[0])
      for (const r of rs.split(',')) if ((r.split(':')[1] ?? '').includes('E')) e.edu.push(`var:${r.split(':')[0]}`)
    }
    t.set(ch, e)
  }
  return t
}

/** All readings of a character, each with where it comes from. */
export function readingSources(ch, table) {
  const e = table.get(ch)
  const src = new Map()
  if (!e) return src
  const add = (r, s) => (src.get(r) ?? src.set(r, new Set()).get(r)).add(s)
  e.uni.forEach((r) => add(r, 'unihan'))
  e.table.forEach((r) => add(r, 'table'))
  e.kd.forEach((r) => add(r, 'kanjidic'))
  e.yale.forEach((r) => add(r, 'kKorean'))
  for (const [v, rs] of Object.entries(e.vars)) rs.forEach((r) => add(r, `variant:${v}`))
  return src
}

// ---------- sk consistency ----------
const FINALS_DROP = new Map([[17, 0], [8, 0], [1, 0]]) // 십→시, 육→유 (ㄱ), 불→부 before ㄷ/ㅈ (부당, 부족)
/**
 * Explains each syllable of `sk` against the readings of the kanji in `core`.
 * Returns { ok, kinds: Set, per: [{ ch, s, how }] } where how is one of
 *   'reading' | 'dueum' (word-initial rule applied) | 'yeol' (렬/률 → 열/율 after a vowel or ㄴ)
 *   | 'dueum-missing' (initial ㄹ/ㄴ kept at the start) | 'dueum-suffix' (rule applied to a suffix)
 *   | 'dueum-inner' (rule applied inside a compound: 신여성) | 'sai' (사이시옷 added) | 'drop' (final dropped: 시월, 유월)
 *   | 'nl' (ㄴ/ㄹ alternation: 곤란, 의논, 허락) | 'variant' (only an old-form reading fits)
 *   | 'minor' (only kKorean/KANJIDIC, not kHangul) | 'none'
 */
export function explainSk(core, sk, affix, table) {
  const hans = [...core].filter(isHan)
  const sy = [...sk]
  const per = []
  if (hans.length !== sy.length) return { ok: false, kinds: new Set(['length']), per }
  let prev = null
  for (let i = 0; i < hans.length; i++) {
    let ch = hans[i]
    if (ch === '々' || ch === 'ゝ') ch = prev ?? ch
    prev = ch
    const s = sy[i]
    const src = readingSources(ch, table)
    const main = new Set([...src].filter(([, w]) => w.has('unihan') || w.has('table')).map(([r]) => r))
    const minor = new Set([...src].filter(([, w]) => [...w].some((x) => x === 'kanjidic' || x === 'kKorean')).map(([r]) => r))
    const vars = new Set([...src].filter(([, w]) => [...w].some((x) => x.startsWith('variant:'))).map(([r]) => r))
    // Unihan often lists the 두음법칙 form beside the original (料 료 요, 女 녀 여); drop such derived forms so
    // that the position rules below decide whether the word may use them
    const every = [...new Set([...main, ...minor, ...vars])]
    const edu = new Set((table.get(ch)?.edu ?? []).map((r) => r.replace(/^var:/, '')))
    const derived = new Set(every.filter((r) => !edu.has(r) && every.some((r2) => r2 !== r && dueum(r2) === r && (!edu.size || edu.has(r2)))))
    for (const set of [main, minor, vars]) for (const r of derived) set.delete(r)
    const all = new Set([...main, ...minor, ...vars])
    const initial = i === 0 && affix !== 'suf'
    const prevS = i > 0 ? jamo(sy[i - 1]) : null
    let how = 'none'
    const fits = (set) => {
      if (initial) {
        if ([...set].some((r) => r === s && dueum(r) === r)) return 'reading'
        if ([...set].some((r) => dueum(r) === s)) return 'dueum'
        if (set.has(s)) return 'dueum-missing'
        return null
      }
      if (set.has(s)) return 'reading'
      // 렬/률 → 열/율 after a vowel or ㄴ (standard spelling: 비율, 규율, 선열)
      if ([...set].some((r) => /[렬률]/.test(r) && dueum(r) === s) && prevS && (prevS.t === 0 || prevS.t === 4)) return 'yeol'
      if ([...set].some((r) => dueum(r) === s && r !== s)) return i === 0 ? 'dueum-suffix' : 'dueum-inner'
      return null
    }
    const fv = fits(vars), fm = fits(minor)
    how = fits(main) ?? (fv ? (['reading', 'dueum'].includes(fv) ? 'variant' : fv) : null) ??
      (fm ? (['reading', 'dueum'].includes(fm) ? 'minor' : fm) : null) ?? 'none'
    if (how === 'none') {
      const j = jamo(s)
      // 사이시옷: the previous syllable got ㅅ (숫자, 횟수, 곳간)
      // (checked on the previous syllable below)
      if ([...all].some((r) => { const q = jamo(r); return q.l === j.l && q.v === j.v && FINALS_DROP.has(q.t) && j.t === 0 })) how = 'drop'
      else if ([...all].some((r) => { const q = jamo(r); return q.v === j.v && q.t === j.t && ((q.l === 2 && j.l === 5) || (q.l === 5 && j.l === 2) || (q.l === 11 && j.l === 5)) })) how = 'nl'
      else if (i < hans.length - 1 && j.t === 19 && [...all].some((r) => { const q = jamo(r); return q.l === j.l && q.v === j.v && q.t === 0 })) how = 'sai'
    }
    per.push({ ch: hans[i], s, how })
  }
  const kinds = new Set(per.map((p) => p.how))
  const ok = [...kinds].every((k) => ['reading', 'dueum', 'yeol'].includes(k))
  return { ok, kinds, per }
}

/** Characters whose Japanese (shinjitai) form has a different Korean reading from its old form (芸 운 / 藝 예). */
export function shinjitaiHazards(table) {
  const out = []
  for (const [ch, e] of table) {
    const own = new Set([...e.uni, ...e.table])
    const varR = new Set(Object.values(e.vars).flat())
    if (!Object.keys(e.vars).length || !varR.size) continue
    const onlyOwn = [...own].filter((r) => !varR.has(r))
    const onlyVar = [...varR].filter((r) => !own.has(r))
    // several old forms with different readings (弁 → 辨 변 / 瓣 판) are hazards too
    const varSets = Object.entries(e.vars).map(([v, rs]) => [v, rs])
    const split = new Set(varSets.map(([, rs]) => rs[0])).size > 1
    if (onlyOwn.length || onlyVar.length || split) out.push({ ch, own: [...own], vars: e.vars, onlyOwn, onlyVar, split })
  }
  return out
}

// ---------- ko containment ----------
const H = /[가-힣]/
/**
 * How the Korean meaning column relates to sk: 'exact' (a ko item is sk, sk+하다/히/적/되다/스럽다/롭다…),
 * 'word' (sk starts a Hangul word), 'inside' (sk occurs inside a longer word), 'none'.
 */
export function koRelation(sk, ko) {
  if (!sk || !ko) return 'none'
  const items = ko.split(/[,;()·/]|\s+/).map((x) => x.replace(/[~～\s.]/g, '')).filter(Boolean)
  const suff = /^(하다|하게|한|히|적|적인|적으로|되다|스럽다|롭다|이다|의|을|를|이|가|에|으로|로|함|하기|됨|시키다|당하다|들|님|생|자|인)?$/
  if (items.some((x) => x === sk || (x.startsWith(sk) && suff.test(x.slice(sk.length))))) return 'exact'
  const re = new RegExp(`(^|[^가-힣])${sk}`)
  if (re.test(ko)) return 'word'
  if (ko.includes(sk)) return 'inside'
  return 'none'
}
export const hasHangul = (s) => H.test(s)

// ---------- deterministic RNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function shuffle(arr, rnd) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
