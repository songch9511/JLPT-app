// Checks a generated explanation against the word, without trusting the model or the structured-output
// guarantee. Errors send the word to the retry list; warnings go to the review sheet.

import { JA_MAX, LIMITS, OUTPUT_SCHEMA } from './schema.mjs'
import {
  core, findParts, hanjaSoundMatches, hasHan, hasHangul, hasKana, hasLatin, isHan, isHangul, isKana,
  len, parseHeadword, readingAligns, soundVariants, toHira,
} from './jp.mjs'

// Words that should not appear in a study card for teenagers and adults. A hit is a warning for review,
// not an automatic rejection: some JLPT words (e.g. 殺す in N2/N1 lists) need neutral sentences, not deletion.
const BLOCK = ['死ね', 'セックス', 'エロ', 'ばか野郎', '麻薬', '自殺', '殺し', '섹스', '자살', '마약', '씨발', '병신']

/** Structural check equivalent to the JSON schema (types, required/extra keys, enums). */
export function checkShape(obj, schema = OUTPUT_SCHEMA, at = '') {
  const errs = []
  const t = schema.type
  if (t === 'object') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [`${at || 'root'}: object expected`]
    for (const k of schema.required || []) if (!(k in obj)) errs.push(`${at}${k}: missing`)
    for (const k of Object.keys(obj)) {
      if (!schema.properties[k]) errs.push(`${at}${k}: unexpected field`)
      else errs.push(...checkShape(obj[k], schema.properties[k], `${at}${k}.`))
    }
  } else if (t === 'array') {
    if (!Array.isArray(obj)) return [`${at.slice(0, -1)}: array expected`]
    obj.forEach((v, i) => errs.push(...checkShape(v, schema.items, `${at}${i}.`)))
  } else if (t === 'string') {
    if (typeof obj !== 'string') errs.push(`${at.slice(0, -1)}: string expected`)
    else if (schema.enum && !schema.enum.includes(obj)) errs.push(`${at.slice(0, -1)}: not one of ${schema.enum.join('/')}`)
  }
  return errs
}

const kanaOnly = (s) => [...s].every((c) => isKana(c) || c === '・')

/**
 * @param {any} out parsed model output
 * @param {import('./words.mjs').Word} word
 * @returns {{ errors: {code: string, field: string, msg?: string}[], warnings: {code: string, field: string, msg?: string}[], matchedBy?: string }}
 */
export function validate(out, word) {
  const errors = []
  const warnings = []
  const err = (code, field, msg) => errors.push({ code, field, ...(msg ? { msg } : {}) })
  const warn = (code, field, msg) => warnings.push({ code, field, ...(msg ? { msg } : {}) })

  const shape = checkShape(out)
  if (shape.length) {
    for (const m of shape) err('schema', m.split(':')[0], m)
    return { errors, warnings }
  }

  const head = parseHeadword(word.w, word.r)
  const headForms = head.forms.map((f) => f.map(toHira))
  const headReadings = head.readings.map((f) => f.map(toHira))
  const headStrings = new Set([...head.forms, ...head.readings].map((p) => toHira(p.join(''))))
  const headLatin = hasLatin(word.w)
  const maxLen = (field, s, n) => len(s) > n && err('too-long', field, `${len(s)} > ${n}`)
  const noLatin = (field, s) => hasLatin(s) && err('latin', field)
  const korean = (field, s) => !hasHangul(s) && err('not-korean', field)

  // examples
  if (out.examples.length !== LIMITS.examples) err('count', 'examples', `${out.examples.length} != 2`)
  let matchedBy = 'form'
  out.examples.forEach((ex, i) => {
    const f = `examples.${i}`
    if (!ex.ja.trim()) return err('empty', `${f}.ja`)
    maxLen(`${f}.ja`, ex.ja, JA_MAX[word.level])
    if (!hasKana(ex.ja) && !hasHan(ex.ja)) err('not-japanese', `${f}.ja`)
    if (!headLatin) noLatin(`${f}.ja`, ex.ja)
    const ja = toHira(ex.ja)
    const byForm = headForms.some((p) => findParts(ja, p))
    const byReading = !byForm && headReadings.some((p) => findParts(ja, p))
    if (!byForm && !byReading) err('headword-missing', `${f}.ja`)
    else if (byReading && hasHan(word.w)) (matchedBy = 'reading'), warn('headword-as-kana', `${f}.ja`)

    if (!ex.kana.trim()) err('empty', `${f}.kana`)
    else {
      maxLen(`${f}.kana`, ex.kana, LIMITS.kanaMax(word.level))
      noLatin(`${f}.kana`, ex.kana)
      if ([...ex.kana].some((c) => isHan(c) || /[0-9０-９]/.test(c))) err('kana-has-kanji', `${f}.kana`)
      else if (!readingAligns(ex.ja, ex.kana)) err('reading-misaligned', `${f}.kana`)
      if (byForm || byReading) {
        const k = core(ex.kana)
        if (!headReadings.some((p) => findParts(k, p, { variants: true }))) err('headword-reading-missing', `${f}.kana`)
      }
    }

    if (!ex.ko.trim()) err('empty', `${f}.ko`)
    else (korean(`${f}.ko`, ex.ko), noLatin(`${f}.ko`, ex.ko), maxLen(`${f}.ko`, ex.ko, LIMITS.exampleKo))
  })
  if (out.examples.length === 2 && core(out.examples[0].ja) === core(out.examples[1].ja)) err('duplicate', 'examples.1.ja')

  // kanji
  const headKanji = new Set(word.kanji.map((k) => k.c))
  const allHeadKanji = new Set([...head.forms.flat().join('')].filter(isHan))
  const refByChar = new Map(word.kanji.map((k) => [k.c, k]))
  const wordReadings = headReadings.map((p) => p.join(''))
  if (out.kanji.length > LIMITS.kanjiEntries) err('too-many', 'kanji', `${out.kanji.length} > ${LIMITS.kanjiEntries}`)
  const seen = new Set()
  out.kanji.forEach((k, i) => {
    const f = `kanji.${i}`
    if (len(k.char) !== 1 || !isHan(k.char) || !allHeadKanji.has(k.char)) err('kanji-not-in-word', `${f}.char`, k.char)
    if (seen.has(k.char)) err('duplicate', `${f}.char`)
    seen.add(k.char)
    if (k.reading) {
      maxLen(`${f}.reading`, k.reading, LIMITS.kanjiReading)
      if (!kanaOnly(k.reading)) err('not-kana', `${f}.reading`)
      else {
        const vs = soundVariants(toHira(k.reading))
        if (!wordReadings.some((r) => vs.some((v) => r.includes(v)))) err('kanji-reading-not-in-word', `${f}.reading`, k.reading)
        const ref = refByChar.get(k.char)
        if (ref && (ref.on.length || ref.kun.length)) {
          const listed = [...ref.on.map(toHira), ...ref.kun.map((x) => x.replace(/^-|-$/g, '').split('.')[0])].filter(Boolean)
          if (!listed.some((x) => vs.some((v) => v === x || v.startsWith(x) || x.startsWith(v)))) warn('kanji-reading-unlisted', `${f}.reading`, k.reading)
        }
      }
    }
    if (k.hanja) {
      maxLen(`${f}.hanja`, k.hanja, LIMITS.kanjiHanja)
      noLatin(`${f}.hanja`, k.hanja)
      korean(`${f}.hanja`, k.hanja)
      const ref = refByChar.get(k.char)
      const sound = [...k.hanja].filter(isHangul).pop()
      if (ref && ref.ko.length && sound && !hanjaSoundMatches(sound, ref.ko)) warn('hanja-sound-mismatch', `${f}.hanja`, `${sound} ∉ ${ref.ko.join('/')}`)
    } else if (refByChar.get(k.char)?.ko.length) warn('hanja-missing', `${f}.hanja`)
  })
  if (headKanji.size && !out.kanji.length) err('kanji-missing', 'kanji')
  else for (const c of headKanji) if (!seen.has(c) && out.kanji.length) warn('kanji-incomplete', 'kanji', c)
  if (!headKanji.size && out.kanji.length) err('kanji-not-in-word', 'kanji')

  // tip / trap
  if (!out.tip.trim()) err('empty', 'tip')
  else (maxLen('tip', out.tip, LIMITS.tip), noLatin('tip', out.tip), korean('tip', out.tip))
  if (word.tag.k === 'S' && out.tip && !hasKana(out.tip)) warn('S-tip-without-reading', 'tip')
  maxLen('trap', out.trap, LIMITS.trap)
  noLatin('trap', out.trap)
  if (out.trap) korean('trap', out.trap)
  if (word.tag.k === 'F' && word.tag.src === 'label' && !out.trap.trim()) err('trap-missing', 'trap')
  if (word.tag.k !== 'F' && out.trap.trim()) warn('trap-on-non-F', 'trap')

  // related
  const n = out.related.length
  if (n < LIMITS.relatedMin || n > LIMITS.relatedMax) err('count', 'related', `${n} not in 2..3`)
  const relSeen = new Set()
  out.related.forEach((r, i) => {
    const f = `related.${i}`
    if (!r.word.trim()) err('empty', `${f}.word`)
    maxLen(`${f}.word`, r.word, LIMITS.relatedWord)
    noLatin(`${f}.word`, r.word)
    if (r.word && !hasKana(r.word) && !hasHan(r.word)) err('not-japanese', `${f}.word`)
    if (!r.kana.trim() || !kanaOnly(r.kana)) err('not-kana', `${f}.kana`)
    maxLen(`${f}.kana`, r.kana, LIMITS.relatedKana)
    maxLen(`${f}.ko`, r.ko, LIMITS.relatedKo)
    noLatin(`${f}.ko`, r.ko)
    korean(`${f}.ko`, r.ko)
    const key = toHira(r.word.replace(/[～〜~\s]/g, ''))
    if (headStrings.has(key)) err('related-is-headword', `${f}.word`, r.word)
    if (relSeen.has(key)) err('duplicate', `${f}.word`)
    relSeen.add(key)
  })

  // origin / meaningFlag
  maxLen('origin', out.origin, LIMITS.origin)
  if (out.origin && !/\p{Script=Katakana}/u.test(word.w)) warn('origin-on-non-loanword', 'origin')
  maxLen('meaningFlag', out.meaningFlag, LIMITS.meaningFlag)
  noLatin('meaningFlag', out.meaningFlag)
  if (out.meaningFlag) (korean('meaningFlag', out.meaningFlag), warn('meaning-flag', 'meaningFlag', out.meaningFlag))

  // content
  const text = [...out.examples.flatMap((e) => [e.ja, e.ko]), out.tip, out.trap].join(' ')
  for (const b of BLOCK) if (text.includes(b)) warn('content-check', 'examples', b)

  return { errors, warnings, matchedBy }
}

/**
 * Checks across words. An example sentence reused for another word is a warning (lazy output);
 * two words with byte-identical outputs is an error for both.
 * @param {Map<string, any>} outputs id → output
 * @returns {Map<string, {errors: any[], warnings: any[]}>}
 */
export function crossCheck(outputs) {
  const res = new Map()
  const add = (id, kind, v) => {
    if (!res.has(id)) res.set(id, { errors: [], warnings: [] })
    res.get(id)[kind].push(v)
  }
  const byExample = new Map()
  const byWhole = new Map()
  for (const [id, o] of outputs) {
    for (const e of o.examples || []) {
      const k = core(e.ja)
      if (!byExample.has(k)) byExample.set(k, [])
      byExample.get(k).push(id)
    }
    const whole = JSON.stringify(o)
    if (!byWhole.has(whole)) byWhole.set(whole, [])
    byWhole.get(whole).push(id)
  }
  for (const ids of byExample.values()) {
    const uniq = [...new Set(ids)]
    if (uniq.length > 1) for (const id of uniq) add(id, 'warnings', { code: 'example-reused', field: 'examples', msg: uniq.filter((x) => x !== id).join(',') })
  }
  for (const ids of byWhole.values()) if (ids.length > 1) for (const id of ids) add(id, 'errors', { code: 'duplicate-output', field: 'root', msg: ids.filter((x) => x !== id).join(',') })
  return res
}
