// Measures how guessable the reading card's choices are without knowing the reading (docs/plan/11).
// Runs a reading-question generator over every reading-card word (k = S) of all five levels, for several
// showings each, and counts the shallow cues a learner could answer from. Not shipped; a dev tool.
//
//   node --experimental-strip-types scripts/distractor-report.mjs [--gen path/to/distractors.ts] [--seeds 5] [--samples]
//
// --gen defaults to src/distractors.ts; to measure an older generator, pass a copy of it
// (git show <rev>:src/distractors.ts > /tmp/old.ts). The generator must export
// readingQuestion(word, pool, seed) -> { choices, answer } | null (null = shown as a meaning card instead).
// The yardsticks are independent of the generator: KANJIDIC on-readings (data/hanja/kanji.tsv) for
// "on'yomi-shaped", JMdict readings (data/readings, scripts/enrich/alt-readings.py) plus every entry of the
// same written word for "another valid reading", and the Korean final-consonant rules of src/sound.ts.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseRow } from '../src/data.ts'
// the study screen seeds a showing with the card's positional id of before stable ids (src/ids.ts)
import { legacySeed } from '../src/ids.ts'

const root = new URL('..', import.meta.url).pathname
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : dflt
}
const genPath = arg('--gen', `${root}src/distractors.ts`)
const SEEDS = Number(arg('--seeds', '5'))
const { readingQuestion } = await import(pathToFileURL(genPath).href)

// ---- data ----
const pool = []
const altOf = new Map()
for (const l of [5, 4, 3, 2, 1]) {
  const rows = JSON.parse(readFileSync(`${root}public/data/words-n${l}.json`, 'utf8'))
  rows.forEach((row, idx) => pool.push(parseRow(l, row, idx)))
  // keyed by stable word id (docs/plan/08 §7), like the rows
  const alt = JSON.parse(readFileSync(`${root}data/readings/n${l}.json`, 'utf8'))
  for (const [id, rs] of Object.entries(alt)) altOf.set(id, rs)
}
const cards = pool.filter((w) => w.k === 'S')
// every reading in the data, for the "only real word" cue (not something the new generator aims at)
const REAL = new Set()

// ---- yardsticks ----
const SMALL = 'ゃゅょぁぃぅぇぉ'
const alternatives = (s) =>
  s
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .split(/[;；、,，\s]+/)
    .map((x) => x.replace(/[～〜~]/g, '').trim())
    .filter(Boolean)
const readingOf = (w) => alternatives(w.r || w.w)[0] ?? ''
const coreOf = (w) => alternatives(w)[0] ?? w
const moraOf = (s) => [...s].filter((c) => !SMALL.includes(c)).length
const VOWEL = new Map()
for (const [v, cs] of [['a', 'あかさたなはまやらわがざだばぱゃぁ'], ['i', 'いきしちにひみりぎじぢびぴぃ'], ['u', 'うくすつぬふむゆるぐずづぶぷゅぅ'], ['e', 'えけせてねへめれげぜでべぺぇ'], ['o', 'おこそとのほもよろをごぞどぼぽょぉ']])
  for (const c of cs) VOWEL.set(c, v)
/** one sound, two spellings: ぢ/じ, づ/ず, long o as おう/おお, long e as えい/ええ */
const soundKey = (s) =>
  s
    .replace(/ぢ/g, 'じ')
    .replace(/づ/g, 'ず')
    .replace(/(.)う/g, (m, c) => (VOWEL.get(c) === 'o' ? c + 'お' : m))
    .replace(/(.)い/g, (m, c) => (VOWEL.get(c) === 'e' ? c + 'え' : m))
/** what the eye sees at a glance: small ゃゅょっ read as big */
const glance = (s) => soundKey(s).replace(/[ゃゅょっ]/g, (c) => ({ ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ' })[c])
const isHan = (c) => /[\p{Script=Han}々]/u.test(c)
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

// every KANJIDIC on-reading, with rendaku and the っ of a closing く/き/つ/ち
const VOICE = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ばぱ', ひ: 'びぴ', ふ: 'ぶぷ', へ: 'べぺ', ほ: 'ぼぽ' }
const ON = new Set()
for (const line of readFileSync(`${root}data/hanja/kanji.tsv`, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue
  for (const r0 of (line.split('\t')[3] ?? '').split(' ').filter(Boolean)) {
    const r = toHira(r0.replace(/-/g, ''))
    for (const f of [r, ...[...(VOICE[r[0]] ?? '')].map((v) => v + r.slice(1))]) {
      ON.add(f)
      if (/[くきつち]$/.test(f) && f.length > 1) ON.add(f.slice(0, -1) + 'っ')
    }
  }
}
/** Splits `s` into `n` segments that pass `ok(seg, i)`; true when some split does. */
function splits(s, n, ok) {
  const memo = new Map()
  const go = (pos, i) => {
    if (i === n) return pos === s.length
    const key = pos * 16 + i
    if (memo.has(key)) return memo.get(key)
    let r = false
    for (let e = pos + 1; e <= Math.min(s.length, pos + 4) && !r; e++) if (ok(s.slice(pos, e), i)) r = go(e, i + 1)
    memo.set(key, r)
    return r
  }
  return go(0, 0)
}
const kanjiOf = (w) => [...coreOf(w.w)].filter(isHan)
const PLAUSIBLE = (s) =>
  !!s && !/^[っんーゃゅょぁぃぅぇぉ]/.test(s) && !/っ$/.test(s) && ![...s].some((c, i) => c === 'っ' && !'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(s[i + 1] ?? ''))
/** a reading the data gives with する (計画 けいかくする): the noun is what is asked */
const noun = (w, s) => (s.endsWith('する') && s.length > 3 && !coreOf(w.w).endsWith('する') ? s.slice(0, -2) : s)
/** on'yomi-shaped: for an on-read word, the kana split into one KANJIDIC on-reading per kanji */
const shaped = (w, s) => {
  s = noun(w, s)
  if (!PLAUSIBLE(s)) return false
  const n = kanjiOf(w).length
  if (w.rt !== 'on' || !n || coreOf(w.w).length !== n) return true
  return splits(s, n, (seg) => ON.has(seg))
}
// Korean final consonant → how the Japanese syllable ends (src/sound.ts, plus っ for an assimilated close)
const finalOf = (syl) => {
  const c = syl.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? c % 28 : -1
}
const ENDS = { 4: /ん$/, 16: /ん$/, 21: /[うい]$/, 1: /[くきっ]$/, 8: /[つちっ]$/, 17: /[うっ]$/ }
const ruleOk = (seg, syl) => {
  const f = finalOf(syl)
  if (f === 0) return !/[んくきつちっ]$/.test(seg) || seg.length === 1
  return ENDS[f] ? ENDS[f].test(seg) : true
}
/** whether a learner applying the Korean–Japanese correspondence would accept `s` for word `w` (null: no rule to apply) */
const korean = (w, s) => {
  s = noun(w, s)
  const ko = [...(w.sk || '')]
  const n = kanjiOf(w).length
  if (w.rt !== 'on' || !n || ko.length !== n || coreOf(w.w).length !== n) return null
  return splits(s, n, (seg, i) => ON.has(seg) && ruleOk(seg, ko[i]))
}
function lev(a, b) {
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
/** Probability that a solver keeping `keep` (indices) and guessing among them is right. */
const p = (keep, answer) => (keep.includes(answer) ? 1 / keep.length : 0)
const filterOr = (idx, f) => {
  const k = idx.filter(f)
  return k.length ? k : idx
}
function lengthKeep(choices, idx) {
  // keep the most common mora count (ties: all tied counts): "the odd length out is wrong"
  const cnt = new Map()
  for (const i of idx) cnt.set(moraOf(choices[i]), (cnt.get(moraOf(choices[i])) ?? 0) + 1)
  const best = Math.max(...cnt.values())
  return idx.filter((i) => cnt.get(moraOf(choices[i])) === best)
}
function medoidKeep(choices, idx) {
  const sum = idx.map((i) => idx.reduce((s, j) => s + lev(choices[i], choices[j]), 0))
  const best = Math.min(...sum)
  return idx.filter((_, k) => sum[k] === best)
}

for (const w of pool) for (const r of alternatives(w.r || w.w)) REAL.add(soundKey(r))
// ---- run ----
const bucketOfMora = (m) => (m >= 5 ? '5+' : String(m))
const groups = new Map()
const group = (key) => {
  if (!groups.has(key))
    groups.set(key, {
      words: new Set(), cards: 0, fallbackMeaning: 0, three: 0, distractors: 0, lenMismatch: 0, lenFar: 0, lenCue: 0,
      unshaped: 0, onDistractors: 0, realOnly: 0, pReal: 0, dup: 0, near: 0, koApplies: 0, koOnly: 0, medoid: 0, valid: 0,
      pLen: 0, pMed: 0, pKo: 0, pShape: 0, pAll: 0, chance: 0, wordsBelow4: new Set(), wordsMeaning: new Set(),
    })
  return groups.get(key)
}
const samples = []
// --show <cue>: list cards hit by one cue (unshaped, length, valid, korean, centre)
const show = arg('--show', '')
const shown = []
const note = (cue, w, q) => show === cue && shown.length < 40 && shown.push(`${w.id} ${w.w} ${readingOf(w)} rt=${w.rt} a=${w.a}: ${q.choices.join(' ')}`)
let worst = 0
let worstWord = ''
const t0 = performance.now()
for (const w of cards) {
  const answer = readingOf(w)
  const mora = moraOf(answer)
  const keys = ['all', `len ${bucketOfMora(mora)}`, `N${w.level}`]
  // readings that are right for this written word: its own, other entries of the same word, JMdict's
  const right = new Set([...alternatives(w.r || w.w), ...(altOf.get(w.id) ?? [])].map(soundKey))
  for (const o of pool) if (coreOf(o.w) === coreOf(w.w) && o.r) for (const r of alternatives(o.r)) right.add(soundKey(r))
  for (let s = 0; s < SEEDS; s++) {
    const t = performance.now()
    const q = readingQuestion(w, pool, `${legacySeed(w.id)}:r|${s}`)
    const dt = performance.now() - t
    if (dt > worst) (worst = dt), (worstWord = `${w.w} ${answer}`)
    if (s === 0) samples.push({ id: w.id, w: w.w, answer, level: w.level, mora, choices: q ? q.choices : null })
    for (const g of keys.map(group)) {
      g.words.add(w.id)
      g.cards++
      if (!q) {
        g.fallbackMeaning++
        g.wordsMeaning.add(w.id)
        continue
      }
      const { choices } = q
      const ans = choices.indexOf(answer)
      const others = choices.filter((_, i) => i !== ans)
      if (choices.length < 4) (g.three++, g.wordsBelow4.add(w.id))
      g.distractors += others.length
      for (const c of others) {
        const d = Math.abs(moraOf(c) - mora)
        if (d) g.lenMismatch++
        if (d >= 2 || (mora <= 2 && d >= 1)) g.lenFar++
        if (w.rt === 'on') g.onDistractors++
        if (!shaped(w, c)) (g.unshaped++, g === groups.get('all') && note('unshaped', w, q))
        if (right.has(soundKey(c))) (g.valid++, g === groups.get('all') && note('valid', w, q))
        if (d && g === groups.get('all')) note('length', w, q)
      }
      const counts = [...new Set(choices.map(moraOf))].map((m) => choices.filter((c) => moraOf(c) === m).length)
      if (!(counts.length === 1 || counts.every((c) => c >= 2))) g.lenCue++
      if (new Set(choices.map(soundKey)).size < choices.length) g.dup++
      if (new Set(choices.map(glance)).size < choices.length) g.near++
      const ko = choices.map((c) => korean(w, c))
      if (ko[ans] === true) {
        g.koApplies++
        if (ko.filter(Boolean).length === 1) (g.koOnly++, g === groups.get('all') && note('korean', w, q))
      }
      const idx = choices.map((_, i) => i)
      const real = choices.map((c) => REAL.has(soundKey(noun(w, c))) || REAL.has(soundKey(c)))
      if (real.filter(Boolean).length === 1) (g.realOnly++, g === groups.get('all') && note('real', w, q))
      g.pReal += p(filterOr(idx, (i) => real[i]), ans)
      const med = medoidKeep(choices, idx)
      if (med.length === 1 && med[0] === ans) (g.medoid++, g === groups.get('all') && note('centre', w, q))
      g.chance += 1 / choices.length
      g.pLen += p(lengthKeep(choices, idx), ans)
      g.pMed += p(med, ans)
      g.pKo += p(ko[ans] === true ? filterOr(idx, (i) => ko[i] === true) : idx, ans)
      g.pShape += p(filterOr(idx, (i) => shaped(w, choices[i])), ans)
      // all cues in turn: drop non-on'yomi shapes, then Korean-rule misfits, then the odd length, then take the centre
      let k = filterOr(idx, (i) => shaped(w, choices[i]))
      if (ko[ans] === true) k = filterOr(k, (i) => ko[i] === true)
      k = lengthKeep(choices, k)
      k = medoidKeep(choices, k)
      g.pAll += p(k, ans)
    }
  }
}
const total = performance.now() - t0

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–')
const order = ['all', 'len 1', 'len 2', 'len 3', 'len 4', 'len 5+', 'N5', 'N4', 'N3', 'N2', 'N1']
console.log(`generator: ${genPath.replace(root, '')}  ·  ${cards.length} reading-card words × ${SEEDS} showings`)
console.log(`time: ${total.toFixed(0)} ms in all, ${(total / (cards.length * SEEDS)).toFixed(3)} ms per card, worst ${worst.toFixed(2)} ms (${worstWord})\n`)
console.log('| group | words | cards | meaning-card fallback | 3 choices | length mismatch (distractors) | obvious length (≥2 mora, or any on 1–2 mora) | length singles out a choice | not on\'yomi-shaped | duplicate / near-duplicate | answer the only Korean-rule fit | answer the unique centre | answer the only real word | valid other reading offered | shallow-cue solver | chance |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const key of order) {
  const g = groups.get(key)
  if (!g) continue
  const shown = g.cards - g.fallbackMeaning
  console.log(
    `| ${key} | ${g.words.size} | ${g.cards} | ${pct(g.fallbackMeaning, g.cards)} | ${pct(g.three, g.cards)} | ${pct(g.lenMismatch, g.distractors)} | ${pct(g.lenFar, g.distractors)} | ${pct(g.lenCue, shown)} | ${pct(g.unshaped, g.distractors)} | ${pct(g.dup, shown)} / ${pct(g.near, shown)} | ${pct(g.koOnly, g.koApplies)} | ${pct(g.medoid, shown)} | ${pct(g.realOnly, shown)} | ${g.valid} | ${pct(g.pAll, shown)} | ${pct(g.chance, shown)} |`,
  )
}
console.log('\nsingle-cue solvers (all cards): ' + ['pLen', 'pMed', 'pKo', 'pShape', 'pReal'].map((k) => `${k} ${pct(groups.get('all')[k], groups.get('all').cards - groups.get('all').fallbackMeaning)}`).join(' · '))
const all = groups.get('all')
console.log(`words on fewer than four choices in some showing: ${all.wordsBelow4.size}; words shown as a meaning card: ${all.wordsMeaning.size}`)
if (show) console.log(shown.join('\n'))
if (process.argv.includes('--samples')) console.log(JSON.stringify(samples))
