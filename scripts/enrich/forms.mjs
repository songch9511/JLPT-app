// Turns a raw vocabulary entry (expression, reading) into clean lookup forms.
// Shared by the frequency step (via words.mjs) and the tag pre-pass, so both see the same "core" word.
//
// Handles: ～/〜 affix markers (prefix, suffix, or a pattern like いくら～ても), parenthetical
// annotations such as "(かん)", "(な)", "(する)", "(をつかむ)", "(はなを～)", several written forms in
// one entry ("丸い; 円い", "回る、回す", "生ける, 活ける", "こうよう もみじ"), and a few one-off
// entries listed in OVERRIDES.

const OVERRIDES = {
  // expression -> { forms, readings } (applied before the generic rules)
  '×': { forms: ['ばつ'], readings: ['ばつ'] },
  '〜 (まる) ごと': { forms: ['丸ごと', 'まるごと'], readings: ['まるごと'] },
  '我': { forms: ['我'], readings: ['が'] }, // reading is "が～" in the source
}

const TILDE = /[～〜~]/
const PARENS = /[(（][^)）]*[)）]/g
const SEP = /[;；、,，]/

export const isHan = (c) => /[\p{Script=Han}々〆ヶ]/u.test(c)
export const isHira = (c) => /[\p{Script=Hiragana}]/u.test(c)
export const isKata = (c) => /[\p{Script=Katakana}ー・]/u.test(c)
export const hasHan = (s) => [...s].some(isHan)
export const isKanaOnly = (s) => s.length > 0 && [...s].every((c) => isHira(c) || isKata(c) || c === ' ')
export const isKatakanaOnly = (s) => s.length > 0 && [...s].every((c) => isKata(c) || c === ' ') && /[\p{Script=Katakana}]/u.test(s)

function splitAlts(s) {
  const out = []
  for (const part of s.replace(PARENS, ' ').split(SEP)) {
    const t = part.trim()
    if (!t) continue
    // "こうよう もみじ" / "しかく しかくい": a space between two words means two alternatives,
    // but "～ しき" (left after removing "(にほん)") is one word with an affix marker.
    const words = t.split(/\s+/).filter((w) => w && !/^[～〜~]+$/.test(w))
    if (words.length > 1 && !TILDE.test(t)) out.push(...words)
    else out.push(t.replace(/\s+/g, ''))
  }
  return out
}

/** Affix position of a single alternative: 'pre' (お～), 'suf' (～屋), 'mid' (いくら～ても), or null. */
function affixOf(alt) {
  if (!TILDE.test(alt)) return null
  const parts = alt.split(TILDE)
  const left = parts[0], right = parts[parts.length - 1]
  if (left && right) return 'mid'
  if (left) return 'pre'
  return 'suf'
}

/** Lookup string for one alternative: tildes removed; a mid pattern keeps its parts space-separated. */
function stripAffix(alt) {
  return alt.split(TILDE).filter(Boolean).join(' ')
}

/**
 * @returns {{ forms: string[], readings: string[], affix: null|'pre'|'suf'|'mid',
 *             core: string, coreReading: string, annotated: boolean, multi: boolean }}
 *   forms: written forms to look up (no tildes, no annotations); first one is the "core" form
 *   readings: kana readings, aligned with forms where the counts match
 */
export function parseEntry(expr, reading) {
  const o = OVERRIDES[expr]
  let forms, readings, affix = null
  if (o) {
    ;({ forms, readings } = o)
  } else {
    const fa = splitAlts(expr)
    const ra = splitAlts(reading || expr)
    affix = fa.map(affixOf).find(Boolean) ?? ra.map(affixOf).find(Boolean) ?? null
    forms = [...new Set(fa.map(stripAffix).filter(Boolean))]
    readings = [...new Set(ra.map(stripAffix).filter(Boolean))]
    if (!forms.length) forms = readings.slice()
  }
  return {
    forms,
    readings,
    affix,
    core: forms[0],
    coreReading: readings[0] ?? forms[0],
    annotated: /[(（]/.test(expr) || /[(（]/.test(reading),
    multi: forms.length > 1 || readings.length > 1,
  }
}
