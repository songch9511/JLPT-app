// Consistency rules for word-type tags (data/tags/LABELLING.md §2.1). Pure functions, shared by
// validate-tags.mjs and the unit tests (tests/unit/tag-rules.test.ts).
import { HADA_VERBS, COUNT_WORD, FIXED, SAME_WORD_EXCEPTIONS, FF_FORMAT } from './tags-schema.mjs'

/** Whether the last Hangul syllable of `s` has a final consonant (decides 과/와, 이라는/라는). */
export const hasFinal = (s) => {
  const c = [...s].filter((x) => /[가-힣]/.test(x)).pop()
  return c ? (c.charCodeAt(0) - 0xac00) % 28 > 0 : false
}

/**
 * Rule breaches for one labelled word. `w` = { core, coreReading, affix } from forms.mjs parseEntry,
 * `t` = { k, sk, ff, rt }. Returns messages (empty when the word follows the rules).
 */
export function ruleErrors(w, t) {
  const out = []
  const { k, sk, ff, rt } = t
  const fixed = FIXED[`${w.core}|${w.coreReading}`]
  if (fixed && (k !== fixed[0] || (fixed[1] && sk !== fixed[1])))
    out.push(`rule table says k=${fixed[0]}${fixed[1] ? ` sk=${fixed[1]}` : ''} (got k=${k}${sk ? ` sk=${sk}` : ''}) — LABELLING.md §2.1`)
  const verb = !w.affix && /^\p{Script=Han}(する|じる|ずる|す)$/u.test(w.core)
  if (verb && rt === 'on' && ['S', 'J'].includes(k) && (k === 'S') !== HADA_VERBS.has(w.core[0]))
    out.push(
      `R1 one-kanji する/じる verb: k must be ${HADA_VERBS.has(w.core[0]) ? 'S (Korean -하다 verb in everyday use)' : 'J (no everyday Korean -하다 verb)'} — add the kanji to HADA_VERBS if Korean uses it`,
    )
  if (!w.affix && COUNT_WORD.test(w.core) && k !== 'S') out.push('R3 numeral day/person/age counts are S (三日 = 3일)')
  if (k === 'F' && typeof ff === 'string') {
    const f = FF_FORMAT.exec(ff)
    if (!f) out.push(`R9 ff must read 한국어 '<word>'(<its sense>)와/과 달리 [주로] '<Japanese sense>'(이)라는 뜻 (got ${JSON.stringify(ff)})`)
    else {
      if (sk && !f[1].replace(/^~/, '').includes(sk)) out.push(`R9 the quoted Korean word '${f[1]}' should contain sk "${sk}"`)
      if ((f[3] === '과') !== hasFinal(f[1])) out.push(`R9 particle after '${f[1]}' should be ${hasFinal(f[1]) ? '과' : '와'}`)
      if ((f[6] === '이라는') !== hasFinal(f[5])) out.push(`R9 '${f[5]}' takes ${hasFinal(f[5]) ? '이라는' : '라는'}`)
    }
  }
  return out
}

/** Key under which two entries count as the same headword: core, reading and affix position. */
export const headwordKey = (w) => `${w.core}|${w.coreReading}|${w.affix ?? ''}|${w.reading ?? ''}`

/**
 * Groups of entries that share a headword but not the same answer. `entries` = [{ key, k, sk, ff, where }].
 * Returns [[key, entries], …] for every conflict not listed in SAME_WORD_EXCEPTIONS (`core|reading`).
 */
export function sameWordConflicts(entries, exceptions = SAME_WORD_EXCEPTIONS) {
  const by = new Map()
  for (const e of entries) (by.get(e.key) ?? by.set(e.key, []).get(e.key)).push(e)
  return [...by].filter(([key, list]) => new Set(list.map((x) => `${x.k}/${x.sk ?? ''}/${x.ff ?? ''}`)).size > 1 && !exceptions.has(key.split('|').slice(0, 2).join('|')))
}
