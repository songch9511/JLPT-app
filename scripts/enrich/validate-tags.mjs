// Validates labelled tag files against the schema and the chunk they came from.
//   node scripts/enrich/validate-tags.mjs                       all data/tags/n*-*.json + aggregate check
//   node scripts/enrich/validate-tags.mjs data/tags/n5-1.json   one or more files (+ aggregate over those)
//   add --quiet to hide warnings. Exit code 1 if there is any error.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { root, levelWords } from './words.mjs'
import { isHan } from './forms.mjs'
import { loadManifest } from './tag-chunks.mjs'
import { prepassLevel, loadKanjiTable } from './prepass.mjs'
import { K_VALUES, RT_VALUES, SK_RULE, FF_MAX, HANGUL_ONLY, JAPANESE } from './tags-schema.mjs'
import { ruleErrors, headwordKey, sameWordConflicts } from './tag-rules.mjs'

const args = process.argv.slice(2)
const quiet = args.includes('--quiet')
const files = args.filter((a) => !a.startsWith('--'))
const dir = `${root}data/tags`
const targets = files.length
  ? files
  : readdirSync(dir).filter((f) => /^n[1-5]-\d+\.json$/.test(f)).sort().map((f) => `${dir}/${f}`)

const manifest = loadManifest()
// Warnings a reviewer has looked at and accepted (sk/rt overrides of the pre-pass candidates):
// { "n1-1:277": "sk 부담: candidate table lacks the reading" }. They are counted, not printed.
const reviewedPath = `${dir}/reviewed.json`
const reviewed = existsSync(reviewedPath) ? JSON.parse(readFileSync(reviewedPath, 'utf8')) : {}
let accepted = 0
const table = loadKanjiTable()
const cache = {}
const level = (n) => (cache[n] ??= { ws: levelWords(n), pre: prepassLevel(n, table) })

let errors = 0, warnings = 0
const seen = {} // level -> Map(idx -> file)
const dist = {}
const byWord = [] // {key, k, sk, ff, where} for the cross-file consistency check

function check(path) {
  const name = basename(path).replace(/\.json$/, '')
  const err = (m) => { errors++; console.log(`ERROR ${name}: ${m}`) }
  const warn = (m, idx) => {
    if (idx !== undefined && reviewed[`${name}:${idx}`]) return void accepted++
    warnings++
    if (!quiet) console.log(`warn  ${name}: ${m}`)
  }
  const m = name.match(/^n([1-5])-(\d+)$/)
  if (!m) return err(`file name must be n<level>-<part>.json (got ${basename(path)})`)
  const n = Number(m[1])
  const chunk = manifest[name]
  if (!chunk) return err(`no chunk "${name}" in data/tags/chunks.json`)
  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    return err(`not valid JSON: ${e.message}`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return err('top level must be an object keyed by idx')
  const { ws, pre } = level(n)
  const want = new Set(chunk.map(String))
  const missing = chunk.filter((i) => !(String(i) in data))
  if (missing.length) err(`${missing.length} idx missing from this chunk: ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? ' …' : ''}`)
  for (const key of Object.keys(data)) if (!want.has(key)) err(`idx ${key} is not part of chunk ${name}`)
  seen[n] ??= new Map()
  dist[n] ??= {}
  for (const key of Object.keys(data).filter((k) => want.has(k))) {
    const i = Number(key), t = data[key], w = ws[i], p = pre[i]
    const at = `idx ${i} (${w.expr})`
    if (seen[n].has(i)) err(`${at} also labelled in ${seen[n].get(i)}`)
    seen[n].set(i, name)
    if (!t || typeof t !== 'object' || Array.isArray(t)) { err(`${at}: value must be an object like {"k":"S","sk":"산업","rt":"on"}`); continue }
    for (const f of Object.keys(t)) if (!['k', 'sk', 'ff', 'rt'].includes(f)) err(`${at}: unknown field "${f}" (allowed: k, sk, ff, rt)`)
    const { k, sk, ff, rt } = t
    if (!K_VALUES.includes(k)) { err(`${at}: k must be one of ${K_VALUES.join('/')} (got ${JSON.stringify(k)})`); continue }
    dist[n][k] = (dist[n][k] ?? 0) + 1
    // same headword = same core, reading and affix position (～中 and 中 may differ; 我(が～) and 我(われ) do)
    byWord.push({ key: headwordKey({ ...w, core: p.core }), k, sk, ff, where: `${name} idx ${i}` })
    for (const m of ruleErrors({ core: p.core, coreReading: w.coreReading, affix: w.affix }, t)) err(`${at}: ${m}`)
    // script consistency
    if (!p.hk && !['L', 'K'].includes(k)) err(`${at}: no kanji in "${p.core}", so k must be L or K (got ${k})`)
    if (p.hk && ['L', 'K'].includes(k)) err(`${at}: "${p.core}" contains kanji, so k cannot be ${k} (use M for kanji+katakana)`)
    if (p.auto && k !== p.auto) warn(`${at}: automatic type is ${p.auto} but labelled ${k} — fine only if deliberate (e.g. katakana onomatopoeia → K)`, i)
    // sk
    const rule = SK_RULE[k]
    if (sk !== undefined && sk !== '') {
      if (rule === 'no') err(`${at}: sk must be omitted for k=${k}`)
      else if (typeof sk !== 'string' || !HANGUL_ONLY.test(sk)) err(`${at}: sk must be Hangul syllables only, no spaces/hanja/kana (got ${JSON.stringify(sk)})`)
      else {
        const nHan = [...p.core].filter(isHan).length
        if ([...sk].length !== nHan) err(`${at}: sk "${sk}" has ${[...sk].length} syllables but "${p.core}" has ${nHan} kanji — one syllable per kanji`)
        else if (p.sk.length && !p.sk.includes(sk)) warn(`${at}: sk "${sk}" is not among the candidates (${p.sk.join(' ')}) — check for typos`, i)
      }
    } else if (rule === 'req') err(`${at}: sk (Korean hanja reading) is required for k=${k}; candidates: ${p.sk.join(' ') || '(none)'}`)
    // ff
    if (ff !== undefined && ff !== '') {
      if (k !== 'F') err(`${at}: ff (false-friend note) is only for k=F (got k=${k})`)
      else if (typeof ff !== 'string' || !/[가-힣]/.test(ff)) err(`${at}: ff must be a Korean sentence`)
      else {
        if (JAPANESE.test(ff)) err(`${at}: ff must not contain Japanese kana or kanji — write the Korean words (got ${JSON.stringify(ff)})`)
        if ([...ff].length > FF_MAX) err(`${at}: ff is ${[...ff].length} characters, max ${FF_MAX}`)
      }
    } else if (k === 'F') err(`${at}: ff is required for k=F — one Korean line saying how the meaning differs`)
    // rt
    if (p.hk) {
      if (!RT_VALUES.includes(rt)) err(`${at}: rt must be one of ${RT_VALUES.join('/')} for a word with kanji (got ${JSON.stringify(rt)}); candidate: ${p.rt}`)
      else if (p.rt && rt !== p.rt) warn(`${at}: rt "${rt}" differs from the automatic candidate "${p.rt}" — fine if checked`, i)
    } else if (rt !== undefined && rt !== '') err(`${at}: rt must be omitted for a word without kanji`)
  }
}

for (const f of targets) {
  if (!existsSync(f)) { errors++; console.log(`ERROR ${f}: file not found`); continue }
  check(f)
}

// aggregate
console.log('\n== aggregate ==')
const done = new Set(targets.map((f) => basename(f).replace(/\.json$/, '')))
for (const n of [5, 4, 3, 2, 1]) {
  const parts = Object.keys(manifest).filter((k) => k.startsWith(`n${n}-`))
  const total = parts.reduce((a, k) => a + manifest[k].length, 0)
  const labelled = seen[n]?.size ?? 0
  const d = dist[n] ? K_VALUES.filter((k) => dist[n][k]).map((k) => `${k}=${dist[n][k]}`).join(' ') : ''
  const todo = parts.filter((k) => !done.has(k))
  console.log(`N${n}: ${labelled}/${total} labelled  ${d}${todo.length ? `  | not checked/labelled: ${todo.join(' ')}` : ''}`)
}
const totals = {}
for (const n in dist) for (const k in dist[n]) totals[k] = (totals[k] ?? 0) + dist[n][k]
console.log(`all: ${K_VALUES.filter((k) => totals[k]).map((k) => `${k}=${totals[k]}`).join(' ')}`)
// the same headword in two chunks or two levels must get the same answer (it is the same word for the learner)
for (const [wk, list] of sameWordConflicts(byWord)) {
  errors++
  console.log(`ERROR same headword labelled differently: ${wk.split('|')[0]} — ${list.map((x) => `${x.where}: ${x.k}${x.sk ? ' ' + x.sk : ''}`).join('; ')}`)
}
console.log(`\n${errors} error(s), ${warnings} warning(s)${quiet && warnings ? ' (hidden by --quiet)' : ''}${accepted ? `, ${accepted} reviewed warning(s) accepted (data/tags/reviewed.json)` : ''}`)
process.exit(errors ? 1 : 0)
