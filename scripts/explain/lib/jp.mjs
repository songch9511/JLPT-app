// Japanese text helpers used by the prompt builder and the validator. No dictionary, no network:
// everything here is a mechanical check that can be explained in one sentence.

export const isHan = (c) => /[\p{Script=Han}々〆ヶ]/u.test(c)
export const isHira = (c) => /\p{Script=Hiragana}/u.test(c)
export const isKata = (c) => /[\p{Script=Katakana}ー]/u.test(c)
export const isKana = (c) => isHira(c) || isKata(c)
export const isHangul = (c) => /\p{Script=Hangul}/u.test(c)
export const hasHan = (s) => [...s].some(isHan)
export const hasHangul = (s) => [...s].some(isHangul)
export const hasKana = (s) => [...s].some(isKana)
/** Latin letters, ASCII or full-width. Digits and punctuation are not letters. */
export const hasLatin = (s) => /[A-Za-zＡ-Ｚａ-ｚ]/.test(s)
export const len = (s) => [...s].length

/** Katakana → hiragana (ー and other characters unchanged). */
export function toHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/** Keep only kana and kanji/digits (drop punctuation, spaces, brackets) and fold katakana to hiragana. */
export function core(s) {
  return toHira([...s].filter((c) => isKana(c) || isHan(c) || /[0-9０-９]/.test(c)).join(''))
}

const TILDE = /[～〜~]/
const PARENS = /[(（][^)）]*[)）]/g
const SEP = /[;；、,，]/
const OVERRIDES = {
  '×': { forms: ['ばつ'], readings: ['ばつ'] },
  '〜 (まる) ごと': { forms: ['丸ごと', 'まるごと'], readings: ['まるごと'] },
  '我': { forms: ['我'], readings: ['が'] },
}

function splitAlts(s) {
  const out = []
  for (const part of s.replace(PARENS, ' ').split(SEP)) {
    const t = part.trim()
    if (!t) continue
    const words = t.split(/\s+/).filter((w) => w && !/^[～〜~]+$/.test(w))
    if (words.length > 1 && !TILDE.test(t)) out.push(...words)
    else out.push(t.replace(/\s+/g, ''))
  }
  return out
}

/**
 * Headword entry → the forms a sentence may contain.
 * Each form is a list of parts that must appear in order (more than one part only for patterns like いくら～ても).
 * @returns {{ forms: string[][], readings: string[][], affix: boolean }}
 */
export function parseHeadword(expr, reading) {
  const o = OVERRIDES[expr]
  if (o) return { forms: o.forms.map((f) => [f]), readings: o.readings.map((r) => [r]), affix: false }
  const fa = splitAlts(expr)
  const ra = splitAlts(reading || expr)
  const affix = [...fa, ...ra].some((a) => TILDE.test(a))
  const parts = (a) => a.split(TILDE).map((p) => p.trim()).filter(Boolean)
  const uniq = (xs) => [...new Map(xs.filter((x) => x.length).map((x) => [x.join('|'), x])).values()]
  const forms = uniq(fa.map(parts))
  // readings must be kana; a few source rows have expression and reading swapped (いただく / 頂く)
  const readings = uniq([...ra, ...fa].map(parts).filter((p) => !p.some(hasHan)))
  return { forms: forms.length ? forms : readings, readings: readings.length ? readings : forms, affix }
}

// Godan rows: dictionary ending → the kana that can follow the stem in other conjugations.
const GODAN = {
  う: ['わ', 'い', 'う', 'え', 'お', 'っ'],
  く: ['か', 'き', 'く', 'け', 'こ', 'い'],
  ぐ: ['が', 'ぎ', 'ぐ', 'げ', 'ご', 'い'],
  す: ['さ', 'し', 'す', 'せ', 'そ'],
  つ: ['た', 'ち', 'つ', 'て', 'と', 'っ'],
  ぬ: ['な', 'に', 'ぬ', 'ね', 'の', 'ん'],
  ぶ: ['ば', 'び', 'ぶ', 'べ', 'ぼ', 'ん'],
  む: ['ま', 'み', 'む', 'め', 'も', 'ん'],
  る: ['ら', 'り', 'る', 'れ', 'ろ', 'っ'],
}
const ICHIDAN_ENDINGS = ['る', 'ます', 'ま', 'ない', 'な', 'なか', 'て', 'た', 'よう', 'れ', 'ろ', 'られ', 'させ', 'さ', 'たい', 'ず', 'ぬ', 'そう', 'に']
const IADJ_ENDINGS = ['い', 'く', 'かっ', 'かろ', 'けれ', 'さ', 'そう', 'すぎ', 'み', 'め']
const SURU = ['する', 'し', 'さ', 'せ', 'す', 'でき']

/**
 * Strings any one of which shows that the word is in the text, allowing for inflection.
 * Verbs and い-adjectives are matched by stem + a possible next kana, never by a bare 1-kana stem,
 * so いる does not match every い in a sentence. Nouns, including する-nouns used alone, match as is.
 */
export function inflections(word) {
  const w = word
  const out = new Set([w])
  const last = w.slice(-1)
  const stem = w.slice(0, -1)
  if (!stem) return [...out]
  if (w === 'いい') for (const e of ['よく', 'よかっ', 'よけれ', 'よさ', '良']) out.add(e)
  if (w.endsWith('する') && w.length > 2) {
    const n = w.slice(0, -2)
    for (const e of SURU) out.add(n + e)
    out.add(n) // the noun alone (勉強する → 勉強を…) is still the word
  } else if (w === 'くる' || w === '来る') {
    for (const e of ['来', 'き', 'こ', 'くれ']) if (w === '来る' ? e === '来' : e !== '来') out.add(e)
  }
  if (GODAN[last]) for (const k of GODAN[last]) out.add(stem + k)
  if (w.endsWith('行く') || w.endsWith('いく')) out.add(stem + 'っ') // 行って/行った: the one irregular godan く verb
  if (last === 'る') for (const e of ICHIDAN_ENDINGS) out.add(stem + e)
  if (last === 'い' && stem.length) for (const e of IADJ_ENDINGS) out.add(stem + e)
  // stems made only of kanji are distinctive enough on their own (見る → 見, 来る → 来)
  if ((GODAN[last] || last === 'い') && [...stem].every(isHan)) out.add(stem)
  return [...out]
}

const VOICED = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' }
const SEMI = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' }

/** Sound changes in compounds: rendaku on the first kana (ほん → ぼん/ぽん) and gemination of the last (がく → がっ). */
export function soundVariants(kana) {
  const out = new Set([kana])
  const first = kana[0]
  for (const m of [VOICED, SEMI]) if (m[first]) out.add(m[first] + kana.slice(1))
  if (kana.length > 1 && /[くちつき]$/.test(kana)) for (const v of [...out]) out.add(v.slice(0, -1) + 'っ')
  if (first === 'ち' && kana.length > 1) out.add('じ' + kana.slice(1)) // 地 ち/じ style
  return [...out]
}

/** Is `parts` (in order) inside `text`, each part allowing inflection? Returns the matched strings or null. */
export function findParts(text, parts, { variants = false } = {}) {
  let from = 0
  const hits = []
  for (const p of parts) {
    let cands = inflections(p)
    if (variants) cands = cands.flatMap(soundVariants)
    let best = -1, hit = ''
    for (const c of cands) {
      const i = text.indexOf(c, from)
      if (i >= 0 && (best < 0 || i < best || (i === best && c.length > hit.length))) (best = i), (hit = c)
    }
    if (best < 0) return null
    hits.push(hit)
    from = best + hit.length
  }
  return hits
}

/**
 * Can `kana` be a reading of `ja`? Every kana in the sentence must appear in the reading in the same order,
 * and every run of kanji/digits must take between 1 and 5 kana per character (承る うけたまわる, 志 こころざし).
 * Punctuation is ignored; katakana and hiragana are treated as the same.
 */
export function readingAligns(ja, kana) {
  const a = core(ja)
  const b = core(kana)
  if (!a || !b) return false
  if ([...b].some((c) => isHan(c) || /[0-9０-９]/.test(c))) return false
  let re = ''
  const chars = [...a]
  for (let i = 0; i < chars.length; ) {
    const c = chars[i]
    if (isHan(c) || /[0-9０-９]/.test(c)) {
      let n = 0
      while (i < chars.length && (isHan(chars[i]) || /[0-9０-９]/.test(chars[i]))) n++, i++
      re += `[\\u3041-\\u3096ー]{1,${n * 5}}`
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i++
    }
  }
  return new RegExp(`^${re}$`, 'u').test(b)
}

// Korean initial-sound law (두음법칙): a dictionary sound may appear with ㄴ/ㄹ changed at the start of a word.
const DUEUM = { 녀: '여', 뇨: '요', 뉴: '유', 니: '이', 랴: '야', 려: '여', 례: '예', 료: '요', 류: '유', 리: '이', 라: '나', 래: '내', 로: '노', 뢰: '뇌', 루: '누', 르: '느', 락: '낙', 란: '난', 랑: '낭', 력: '역', 련: '연', 렬: '열', 렴: '염', 령: '영', 록: '녹', 론: '논', 룡: '용', 륙: '육', 륜: '윤', 률: '율', 륭: '융', 름: '늠', 릉: '능', 린: '인', 림: '임', 립: '입', 녁: '역', 년: '연', 념: '염', 녕: '영', 뉵: '육', 닉: '익', 닐: '일' }
export function hanjaSoundMatches(sound, refs) {
  return refs.some((r) => r === sound || DUEUM[r] === sound || DUEUM[sound] === r)
}
