// Builds the app's word data from data/raw/*.csv (open-anki-jlpt-decks, MIT), the stable word ids of
// data/ids.json and the enrichment inputs keyed by those ids (data/ko, data/freq, data/tags, data/readings).
// data/corrections.json overrides source columns the registry does not cover (the English gloss `en`), by id, and
// records the Korean meanings `ko` corrected in data/ko (checked, not applied).
//
//   node scripts/build-data.mjs                 public/data/words-n{l}.json rows [id, w, r, ko, en]
//   node scripts/build-data.mjs --extras        rows [id, w, r, ko, en, o, f, k, sk, ff, rt, a, x]  (what the app ships)
//   node scripts/build-data.mjs --extras --out <dir>   write the word files somewhere other than public/data
//   node scripts/build-data.mjs --assign-ids    issue ids to source words that have none (new words), then build
//   node scripts/build-data.mjs --check         check the registry and inputs (and the pictures' names), write nothing
//
// Every build also writes src/generated/word-ids.ts (the app's id table, from data/ids.json); for each level that has
// them, the example sentences of data/examples/n{l}.json as public/data/examples-n{l}.json (checked first); the kanji
// of the word lists as public/data/kanji.json (`kanjiRows`); and src/generated/content.ts, which tells the app which
// levels have examples, which kanji belong to each level and which words have a picture (public/img/words, `readPictures`).
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
  const problems = applyCorrections(levels)
  if (problems.length) {
    const e = new Error(`${CORRECTIONS_FILE} does not apply (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n  ${problems.join('\n  ')}`)
    e.problems = problems
    throw e
  }
  return levels
}

// ---- corrections to source columns the registry does not cover (docs/plan/08 §7.2) ----
// data/corrections.json: { format: 1, words: { "<id>": { en: "<corrected>", ko?: "<corrected>", was: { en: "<source value>", ko?: "<old value>" }, why: "<date>: <reason>" } } }
// `en` (the English gloss, from the upstream CSV) is corrected here, over the source; a headword/reading typo is fixed
// in the CSV and the registry entry together. `was` must still be what the source says, so an upstream change that
// fixes (or alters) the row stops the build instead of being silently overwritten. Every entry must name a live word
// and change something.
// `ko` (this project's own model translation, read by several scripts straight from data/ko) is corrected in data/ko
// itself; the entry only records it (was/why), and checkKoCorrections stops the build if data/ko no longer holds the
// corrected value (e.g. a re-translation from the old gloss), so the record and the data cannot drift apart.
const CORRECTIONS_FILE = 'data/corrections.json'
const CORRECTABLE = ['en']
const RECORDED = ['ko']
const readCorrections = () => (existsSync(`${root}${CORRECTIONS_FILE}`) ? JSON.parse(readFileSync(`${root}${CORRECTIONS_FILE}`, 'utf8')) : { format: 1, words: {} })

/** Checks the recorded `ko` corrections against data/ko ({ "<id>": ko }); returns the problems found. */
export function checkKoCorrections(ko, corr = readCorrections()) {
  const problems = []
  for (const [id, c] of Object.entries(corr?.words ?? {})) {
    if (!('ko' in (c ?? {}))) continue
    if (typeof c.ko !== 'string' || !c.ko.trim() || c.ko !== c.ko.trim()) problems.push(`${id}: ko must be a non-empty trimmed string`)
    else if (typeof c.was?.ko !== 'string' || c.was.ko === c.ko) problems.push(`${id}: ko needs the old value in was.ko, different from the corrected one`)
    else if ((ko[id] ?? '').trim() !== c.ko) problems.push(`${id}: data/ko has ${JSON.stringify(ko[id] ?? '')}, not the recorded correction ${JSON.stringify(c.ko)}: restore it, or update the correction`)
  }
  return problems
}

/** Applies data/corrections.json to the resolved words in place; returns the problems found (none applied if any). */
export function applyCorrections(levels, corr = readCorrections()) {
  const problems = []
  if (corr?.format !== 1 || typeof corr.words !== 'object' || !corr.words) return [`${CORRECTIONS_FILE}: not a format-1 corrections file`]
  const byId = new Map(LEVELS.flatMap((l) => levels[l].map((w) => [w.id, w])))
  const todo = []
  for (const [id, c] of Object.entries(corr.words)) {
    const w = byId.get(id)
    if (!w) { problems.push(`${id}: not a live word id`); continue }
    if (typeof c?.why !== 'string' || !c.why.trim()) problems.push(`${id}: needs "why" (<date>: <reason>)`)
    const fields = Object.keys(c ?? {}).filter((f) => f !== 'was' && f !== 'why')
    if (!fields.length) problems.push(`${id}: corrects nothing`)
    for (const f of fields) {
      if (RECORDED.includes(f)) continue // checked against data/ko by checkKoCorrections
      if (!CORRECTABLE.includes(f)) { problems.push(`${id}: "${f}" cannot be corrected here (only ${[...CORRECTABLE, ...RECORDED].join(', ')}; headword/reading → CSV + data/ids.json, §7.2)`); continue }
      if (typeof c[f] !== 'string' || !c[f].trim() || c[f] !== c[f].trim()) { problems.push(`${id}: ${f} must be a non-empty trimmed string`); continue }
      if (c.was?.[f] !== w[f]) { problems.push(`${id}: was.${f} ${JSON.stringify(c.was?.[f])} is not what the source says (${JSON.stringify(w[f])}): the source changed — check the row, then update or drop the correction`); continue }
      if (c[f] === w[f]) { problems.push(`${id}: ${f} is already ${JSON.stringify(c[f])} in the source: drop the correction`); continue }
      todo.push([w, f, c[f]])
    }
    for (const f of Object.keys(c?.was ?? {})) if (!fields.includes(f)) problems.push(`${id}: was.${f} given but ${f} is not corrected`)
  }
  if (!problems.length) for (const [w, f, v] of todo) w[f] = v
  return problems
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
  problems.push(...checkKoCorrections(ko).map((p) => `${CORRECTIONS_FILE} ${p}`))
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

// ---- example sentences (data/examples/n{l}.json, data/examples/README.md) ----
// { "<word id>": { "seg": [[text] | [text, reading], …], "ko": "<Korean translation>" } }: joining the segments' texts
// gives the Japanese sentence; a segment with kanji carries its reading in hiragana (the app's furigana), a kana
// segment none. Only some levels have them (N5 for now); a level without a file shows no example.
const KANJI = /[\u3400-\u9fff々〆ヶ]/
const HIRAGANA = /^[\u3041-\u3096ー]+$/
const HANGUL = /[가-힣]/

/** The example files there are: { [level]: { "<id>": example } }. */
export function readExamples() {
  const out = {}
  for (const l of LEVELS) {
    const f = `${root}data/examples/n${l}.json`
    if (existsSync(f)) out[l] = JSON.parse(readFileSync(f, 'utf8'))
  }
  return out
}

/** The problems with one level's examples (every id a live word of that level, every segment well formed). */
export function checkExamples(l, examples, words) {
  const problems = []
  const ids = new Set(words.map((w) => w.id))
  if (!examples || typeof examples !== 'object' || Array.isArray(examples)) return [`data/examples/n${l}.json: not an object`]
  for (const [id, e] of Object.entries(examples)) {
    const at = `data/examples/n${l}.json ${id}`
    if (!ids.has(id)) problems.push(`${at}: not a word of N${l}`)
    if (!e || typeof e !== 'object' || !Array.isArray(e.seg) || !e.seg.length) { problems.push(`${at}: no segments`); continue }
    if (Object.keys(e).some((k) => k !== 'seg' && k !== 'ko')) problems.push(`${at}: only seg and ko`)
    for (const g of e.seg) {
      if (!Array.isArray(g) || g.length < 1 || g.length > 2 || g.some((x) => typeof x !== 'string' || !x)) { problems.push(`${at}: bad segment ${JSON.stringify(g)}`); continue }
      const kanji = KANJI.test(g[0])
      if (kanji && g.length < 2) problems.push(`${at}: no reading for ${g[0]}`)
      // a reading belongs to the kanji it is over: okurigana and particles are segments of their own
      if (kanji && /[\u3041-\u3096]/.test(g[0])) problems.push(`${at}: kana inside a kanji segment ${g[0]}`)
      if (!kanji && g.length === 2) problems.push(`${at}: a reading on kana ${g[0]}`)
      if (g.length === 2 && !HIRAGANA.test(g[1])) problems.push(`${at}: reading not in hiragana: ${g[1]}`)
    }
    const ja = e.seg.map((g) => (Array.isArray(g) ? g[0] : '')).join('')
    if (!/[。？]$/.test(ja)) problems.push(`${at}: the sentence does not end in 。 or ？`)
    if (typeof e.ko !== 'string' || !HANGUL.test(e.ko) || e.ko !== e.ko.trim()) problems.push(`${at}: no Korean translation`)
  }
  return problems
}

/** public/data/examples-n{l}.json: the same entries, in the level's id order, one line. */
export const exampleFile = (examples) => JSON.stringify(Object.fromEntries(Object.keys(examples).sort().map((id) => [id, examples[id]])))

// ---- kanji (public/data/kanji.json) ----
// Every kanji that appears in the word lists, given to the first level (N5 → N1) whose words contain it, in the order
// the level's words are introduced (data/freq/order-n{l}.json). Readings come from data/hanja/kanji.tsv; the Korean
// 훈음 from data/hanja/hun.json ({ "強": { "hun": "강할", "eum": "강" } }) when that file exists, else the first
// Korean reading of the table (Unihan, then KANJIDIC2) with an empty 훈.
//
//   row: [kanji, level, hun, eum, on, kun, ko, wordIds]
//   on   on'yomi in katakana, space-separated (KANJIDIC2)
//   kun  kun'yomi in hiragana, KANJIDIC2 notation ("つよ.い": okurigana after the dot), space-separated
//   ko   every Korean reading the table gives, space-separated (search by 음)
//   wordIds  the words containing it, easiest level first, then in introduction order
const HAN = /\p{Script=Han}/u
const isKanji = (ch) => HAN.test(ch) && ch !== '々' && ch !== '〆'

/** data/hanja/hun.json, or null when it is not there yet. */
export function readHun() {
  const f = `${root}data/hanja/hun.json`
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

/** The kanji rows, easiest level first: { rows, counts: { [level]: n } }. */
export function kanjiRows(levels, order, table = (kanjiTable ??= loadKanjiTable()), hun = readHun()) {
  const level = new Map()
  const words = new Map()
  for (const l of LEVELS) {
    const byId = new Map(levels[l].map((w) => [w.id, w]))
    for (const id of order[l]) {
      const w = byId.get(id)
      for (const ch of new Set(w.w)) {
        if (!isKanji(ch)) continue
        if (!level.has(ch)) level.set(ch, l)
        words.set(ch, [...(words.get(ch) ?? []), id])
      }
    }
  }
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]))
  const rows = [...level].map(([k, l]) => {
    counts[l]++
    const t = table.get(k) ?? { ko: [], on: [], kun: [] }
    const h = hun?.[k]
    const eum = typeof h?.eum === 'string' && h.eum ? h.eum : (t.ko[0] ?? '')
    return [k, l, typeof h?.hun === 'string' ? h.hun : '', eum, t.on.join(' '), t.kun.join(' '), [...new Set(t.ko)].join(' '), words.get(k)]
  })
  return { rows, counts }
}

// ---- word pictures (public/img/words/<word id>.webp, docs/design-system.md §3 "학습 카드") ----
// One illustration per word at most, a 16:9 WebP named by the word's stable id. The folder is the only list: every
// .webp there must be named by a live word id; other files (a half-written download, .DS_Store) are left alone. The
// app shows a picture only for the ids written into src/generated/content.ts, so a file added without `npm run data`
// is simply not shown yet.
export const PICTURE_DIR = 'public/img/words'

/** The .webp files of a folder and what is wrong with their names: { ids (sorted), problems }. */
export function readPictures(known, dir = `${root}${PICTURE_DIR}`) {
  const ids = []
  const problems = []
  if (!existsSync(dir)) return { ids, problems }
  for (const f of readdirSync(dir).sort()) {
    if (!f.toLowerCase().endsWith('.webp')) continue
    const id = f.slice(0, -'.webp'.length)
    if (!f.endsWith('.webp')) problems.push(`${PICTURE_DIR}/${f}: the extension must be .webp in lower case`)
    else if (!known.has(id)) problems.push(`${PICTURE_DIR}/${f}: "${id}" is not a live word id (name each picture <word id>.webp, e.g. w0e7.webp)`)
    else ids.push(id)
  }
  return { ids, problems }
}

/**
 * src/generated/content.ts: the levels with example sentences, each level's kanji in introduction order, and the
 * words that have a picture.
 */
export function contentModule(exampleLevels, rows, pictures = []) {
  const by = Object.fromEntries(LEVELS.map((l) => [l, rows.filter((r) => r[1] === l).map((r) => r[0]).join('')]))
  return `// GENERATED by scripts/build-data.mjs. Do not edit.

/** Levels with example sentences (public/data/examples-n{l}.json, from data/examples/n{l}.json). */
export const EXAMPLE_LEVELS: readonly (1 | 2 | 3 | 4 | 5)[] = ${JSON.stringify(exampleLevels)}

/** Each level's kanji, in introduction order (public/data/kanji.json has their readings and words). */
export const KANJI_BY_LEVEL: Record<1 | 2 | 3 | 4 | 5, string> = ${JSON.stringify(by)}

/** The words with a picture, in id order: public/img/words/<id>.webp. */
export const WORD_PICTURES: readonly string[] = ${JSON.stringify([...pictures].sort())}
`
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
  const examples = readExamples()
  const exampleProblems = Object.entries(examples).flatMap(([l, e]) => checkExamples(Number(l), e, levels[l]))
  if (exampleProblems.length) {
    console.error(`example sentences do not check:\n  ${exampleProblems.slice(0, 40).join('\n  ')}`)
    process.exit(1)
  }
  const pictures = readPictures(new Set(LEVELS.flatMap((l) => levels[l].map((w) => w.id))))
  if (pictures.problems.length) {
    console.error(`word pictures are not named by word ids:\n  ${pictures.problems.slice(0, 40).join('\n  ')}`)
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
  for (const [l, e] of Object.entries(examples)) {
    writeFileSync(`${outDir}examples-n${l}.json`, exampleFile(e))
    console.log(`N${l}: ${Object.keys(e).length} example sentences`)
  }
  const { rows: kanji, counts } = kanjiRows(levels, inputs.order)
  writeFileSync(`${outDir}kanji.json`, JSON.stringify(kanji))
  console.log(`kanji: ${kanji.length} (${LEVELS.map((l) => `N${l} ${counts[l]}`).join(', ')})${readHun() ? '' : ', no data/hanja/hun.json yet: 훈 empty'}`)
  mkdirSync(`${root}src/generated`, { recursive: true })
  writeFileSync(`${root}src/generated/word-ids.ts`, idModule(reg))
  writeFileSync(`${root}src/generated/content.ts`, contentModule(Object.keys(examples).map(Number).sort((a, b) => b - a), kanji, pictures.ids))
  console.log(`word pictures: ${pictures.ids.length}`)
  console.log('src/generated/word-ids.ts, src/generated/content.ts written')
}
