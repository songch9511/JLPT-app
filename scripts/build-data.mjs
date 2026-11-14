// Builds the app's word data from data/raw/*.csv (open-anki-jlpt-decks, MIT), the stable word ids of
// data/ids.json and the enrichment inputs keyed by those ids (data/ko, data/freq, data/tags, data/readings).
//
//   node scripts/build-data.mjs                 public/data/words-n{l}.json rows [id, w, r, ko, en]
//   node scripts/build-data.mjs --extras        rows [id, w, r, ko, en, o, f, k, sk, ff, rt, a, x]  (what the app ships)
//   node scripts/build-data.mjs --extras --out <dir>   write the word files somewhere other than public/data
//   node scripts/build-data.mjs --assign-ids    issue ids to source words that have none (new words), then build
//   node scripts/build-data.mjs --check         check the registry and inputs, write nothing
//
// Every build also writes src/generated/word-ids.ts (the app's id table, from data/ids.json).
//
// Word ids (docs/plan/08-word-data.md §7) come from data/ids.json and never from a word's position. The build
// fails, writing nothing, when a source word has no registered id, when two words would share one, when an
// issued id has no source word and no tombstone, or when an enrichment input names an id that is not a word.
// Rows are written in id order: the 8,130 words that existed when ids were introduced keep the row order of the
// positional files, new words come last. Row order means nothing to the app; `o` is the introduction order.
//
// public/data/n{l}.json are the positional files of the version before stable ids. They are frozen (never
// written again, byte-identical, tests/unit/data.test.ts) because a tab still running that version after an
// update reads them; see docs/plan/08 §7.6 for when to delete them.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { parseEntry } from './enrich/forms.mjs'
import { alignOn } from './enrich/align.mjs'
import { loadKanjiTable } from './enrich/prepass.mjs'
import { assignNew, counterOf, formatRegistry, LEVELS, liveIds, loadRegistry, readSource, REGISTRY, resolve } from './word-ids.mjs'

const root = new URL('..', import.meta.url).pathname

/** Every level's source words with their stable ids, in id order: { [level]: [{ id, l, w, r, en }] }. Throws on any registry problem. */
export function loadWords(reg = loadRegistry()) {
  const sources = Object.fromEntries(LEVELS.map((l) => [l, readSource(l)]))
  const { errors, levels } = resolve(sources, reg)
  if (errors.length) {
    const e = new Error(`data/ids.json does not match the source (${errors.length} problem${errors.length > 1 ? 's' : ''}):\n  ${errors.slice(0, 40).join('\n  ')}`)
    e.problems = errors
    throw e
  }
  for (const l of LEVELS) levels[l].forEach((w) => (w.l = l))
  return levels
}

/** One level's words with ids, in id order: [{ id, l, w, r, en }]. */
export const loadLevel = (n, reg) => loadWords(reg)[n]

/** `{ "<id>": value }` from every file in a directory matching `re` (files group words by level/chunk; keys decide). */
function readKeyed(dir, re, what, known, problems) {
  const out = {}
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((f) => re.test(f)).sort()) {
    const obj = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    for (const [id, v] of Object.entries(obj)) {
      if (!known.has(id)) problems.push(`${what} ${f}: "${id}" is not a live word id`)
      else if (id in out) problems.push(`${what} ${f}: "${id}" is given twice`)
      out[id] = v
    }
  }
  return out
}

/** The enrichment inputs, keyed by stable id and checked against the live ids. */
export function loadInputs(levels) {
  const problems = []
  const known = new Set(LEVELS.flatMap((l) => levels[l].map((w) => w.id)))
  const ko = readKeyed(`${root}data/ko`, /^n[1-5]-\d+\.json$/, 'data/ko', known, problems)
  const tags = readKeyed(`${root}data/tags`, /^n[1-5]-\d+\.json$/, 'data/tags', known, problems)
  const freq = readKeyed(`${root}data/freq`, /^n[1-5]\.json$/, 'data/freq', known, problems)
  const alt = readKeyed(`${root}data/readings`, /^n[1-5]\.json$/, 'data/readings', known, problems)
  const order = {}
  for (const l of LEVELS) {
    const o = JSON.parse(readFileSync(`${root}data/freq/order-n${l}.json`, 'utf8'))
    const ids = new Set(levels[l].map((w) => w.id))
    if (o.length !== ids.size || new Set(o).size !== o.length || !o.every((id) => ids.has(id)))
      problems.push(`data/freq/order-n${l}.json is not an ordering of N${l}'s ${ids.size} live ids: rerun scripts/enrich/freq.py`)
    order[l] = o
  }
  return { ko, tags, freq, alt, order, problems }
}

// ---- extra columns (opt-in with --extras) ----
// o  introduction order within the level (0 = introduce first), from data/freq/order-n{l}.json
// f  frequency, round(Zipf * 10), 10..80, from data/freq/n{l}.json
// k, sk, ff, rt  word-type tags from labelled data/tags/n{l}-*.json; '' when not labelled yet
// a  for k=S/F/J words read entirely on'yomi: the reading cut per kanji ("さん|ぎょう"), when KANJIDIC2
//    on-readings allow exactly one cut; used by the app's sound-correspondence hint. '' otherwise.
// x  for k=S words (reading cards): the other readings JMdict gives the written form, space-separated, from
//    data/readings/n{l}.json (scripts/enrich/alt-readings.py); never offered as a wrong choice. '' otherwise.
// Trailing empty columns are dropped, so a row is 7 long until it is labelled (at most 13).
const TAG_FIELDS = ['k', 'sk', 'ff', 'rt']

let kanjiTable
export function extraColumns(words, inputs, order) {
  kanjiTable ??= loadKanjiTable()
  const pos = new Map(order.map((id, i) => [id, i]))
  let tagged = 0
  let aligned = 0
  const cols = words.map((w) => {
    const t = inputs.tags[w.id] ?? {}
    if (t.k) tagged++
    let a = ''
    if (['S', 'F', 'J'].includes(t.k) && t.rt === 'on' && t.sk) {
      const { core, coreReading } = parseEntry(w.w, w.r)
      a = alignOn(core, coreReading, kanjiTable)?.join('|') ?? ''
      if (a) aligned++
    }
    const x = t.k === 'S' ? (inputs.alt[w.id] ?? []).join(' ') : ''
    const row = [pos.get(w.id), inputs.freq[w.id] ?? 0, ...TAG_FIELDS.map((k) => t[k] ?? ''), a, x]
    while (row.length > 2 && row[row.length - 1] === '') row.pop()
    return row
  })
  return { cols, tagged, aligned }
}

/** One level's rows: [id, w, r ('' when it is the headword), ko ('' if none), en, ...extras]. */
export function levelRows(words, inputs, extras) {
  let missing = 0
  const out = words.map((w) => {
    const k = (inputs.ko[w.id] ?? '').trim()
    if (!k) missing++
    return [w.id, w.w, w.r === w.w ? '' : w.r, k, w.en]
  })
  let note = ''
  if (extras) {
    const { cols, tagged, aligned } = extraColumns(words, inputs, inputs.order[words[0]?.l] ?? [])
    out.forEach((row, i) => row.push(...cols[i]))
    note = `, extras: order+freq for all, tags for ${tagged}, reading split for ${aligned}`
  }
  return { rows: out, missing, note }
}

/** src/generated/word-ids.ts: which level each live id belongs to, and the frozen positional → stable map. */
export function idModule(reg) {
  const runs = []
  for (const { l, n } of liveIds(reg)) {
    const last = runs[runs.length - 1]
    if (last && last[2] === l && last[0] + last[1] === n) last[1]++
    else runs.push([n, 1, l])
  }
  const legacy = Object.entries(reg.ids)
    .filter(([, e]) => e.legacy)
    .map(([id, e]) => [Number(e.legacy[0]), Number(e.legacy.split('-')[1]), counterOf(id)])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const lruns = []
  for (const [l, idx, n] of legacy) {
    const last = lruns[lruns.length - 1]
    if (last && last[0] === l && last[1] + last[2] === idx && last[3] + last[2] === n) last[2]++
    else lruns.push([l, idx, 1, n])
  }
  return `// GENERATED by scripts/build-data.mjs from data/ids.json. Do not edit (docs/plan/08-word-data.md §7).

/** Live word ids as runs of consecutive counters: [first counter, how many, level]. Id = 'w' + base-36 counter, ≥ 3 digits. */
export const ID_RUNS: readonly (readonly [number, number, 1 | 2 | 3 | 4 | 5])[] = ${JSON.stringify(runs)}

/**
 * The positional ids of the versions before stable ids (\`<level>-<idx>\`, state v2/v3, backup format 1/2) and the
 * stable id each became, as runs: [level, first idx, how many, first counter]. Frozen: it describes data that no
 * longer changes, and is what the one-time migration of saved states and old backups reads.
 */
export const LEGACY_RUNS: readonly (readonly [1 | 2 | 3 | 4 | 5, number, number, number])[] = ${JSON.stringify(lruns)}

/** The registry's next counter: every id below it was issued at some point (live or retired). */
export const ID_NEXT = ${reg.next}
`
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2)
  const extras = args.includes('--extras')
  const check = args.includes('--check')
  const outArg = args.indexOf('--out')
  const outDir = outArg >= 0 ? args[outArg + 1].replace(/\/?$/, '/') : `${root}public/data/`
  const reg = loadRegistry()
  if (args.includes('--assign-ids')) {
    const sources = Object.fromEntries(LEVELS.map((l) => [l, readSource(l)]))
    const added = assignNew(sources, reg)
    writeFileSync(REGISTRY, formatRegistry(reg))
    console.log(`data/ids.json: ${added.length} new id(s)${added.length ? ': ' + added.join(' ') : ''}`)
  }
  let levels
  try {
    levels = loadWords(reg)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  const inputs = loadInputs(levels)
  if (inputs.problems.length) {
    console.error(`enrichment inputs do not match the word ids:\n  ${inputs.problems.slice(0, 40).join('\n  ')}`)
    process.exit(1)
  }
  const dropped = LEVELS.flatMap((l) => readSource(l).dropped.map((d) => `N${l} ${d.w}|${d.r}`))
  if (dropped.length) console.log(`duplicate source rows merged (first kept): ${dropped.join(', ')}`)
  const out = LEVELS.map((l) => [l, levelRows(levels[l], inputs, extras)])
  if (check) {
    console.log(`ok: ${Object.keys(reg.ids).length} registered ids, ${LEVELS.reduce((s, l) => s + levels[l].length, 0)} live words`)
    process.exit(0)
  }
  mkdirSync(outDir, { recursive: true })
  for (const [l, { rows, missing, note }] of out) {
    writeFileSync(`${outDir}words-n${l}.json`, JSON.stringify(rows))
    console.log(`N${l}: ${rows.length} words, ${missing} without Korean${note}`)
  }
  mkdirSync(`${root}src/generated`, { recursive: true })
  writeFileSync(`${root}src/generated/word-ids.ts`, idModule(reg))
  console.log('src/generated/word-ids.ts written')
}
