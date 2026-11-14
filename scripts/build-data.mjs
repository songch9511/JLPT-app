// Builds public/data/n{1..5}.json from data/raw/*.csv (open-anki-jlpt-decks, MIT)
// and Korean meanings in data/ko/n{level}-*.json ({ "<idx>": "뜻" }).
// Word order is a fixed seeded shuffle so that word ids (`<level>-<idx>`) stay stable.
//
//   node scripts/build-data.mjs                   rows [w, r, ko, en]                         (the original four)
//   node scripts/build-data.mjs --extras          rows [w, r, ko, en, o, f, k, sk, ff, rt, a, x]  (what the app ships)
//   node scripts/build-data.mjs --extras --out <dir>   write somewhere other than public/data
// --extras appends columns after the existing four (which never change) from data/freq/ and data/tags/;
// see docs/plan/08-word-data.md for the row format.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { parseEntry } from './enrich/forms.mjs'
import { alignOn } from './enrich/align.mjs'
import { loadKanjiTable } from './enrich/prepass.mjs'

const root = new URL('..', import.meta.url).pathname

function parseCsv(text) {
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function loadLevel(n) {
  const rows = parseCsv(readFileSync(`${root}data/raw/n${n}.csv`, 'utf8')).slice(1)
  const seen = new Set(), words = []
  for (const [expr, reading, meaning] of rows) {
    if (!expr || seen.has(expr + '|' + reading)) continue
    seen.add(expr + '|' + reading)
    words.push([expr.trim(), reading.trim(), meaning.trim()])
  }
  const rnd = mulberry32(1000 + n)
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]]
  }
  return words
}

// ---- extra columns (step 2, opt-in with --extras) ----
// o  introduction order within the level (0 = introduce first), from data/freq/order-n{l}.json
// f  frequency, round(Zipf * 10), 10..80, from data/freq/n{l}.json
// k, sk, ff, rt  word-type tags from labelled data/tags/n{l}-*.json; '' when not labelled yet
// a  for k=S/F/J words read entirely on'yomi: the reading cut per kanji ("さん|ぎょう"), when KANJIDIC2
//    on-readings allow exactly one cut; used by the app's sound-correspondence hint. '' otherwise.
// x  for k=S words (reading cards): the other readings JMdict gives the written form, space-separated, from
//    data/readings/n{l}.json (scripts/enrich/alt-readings.py); never offered as a wrong choice. '' otherwise.
// Trailing empty columns are dropped, so a row is 6 long until it is labelled (at most 12).
const TAG_FIELDS = ['k', 'sk', 'ff', 'rt']

let kanjiTable
export function extraColumns(n, count, words = loadLevel(n)) {
  kanjiTable ??= loadKanjiTable()
  const order = JSON.parse(readFileSync(`${root}data/freq/order-n${n}.json`, 'utf8'))
  const freq = JSON.parse(readFileSync(`${root}data/freq/n${n}.json`, 'utf8'))
  if (order.length !== count || [...order].sort((a, b) => a - b).some((v, i) => v !== i))
    throw new Error(`data/freq/order-n${n}.json is not a permutation of 0..${count - 1}: rerun scripts/enrich/freq.py`)
  const o = new Array(count)
  order.forEach((idx, pos) => (o[idx] = pos))
  const tags = {}
  const dir = `${root}data/tags`
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((f) => new RegExp(`^n${n}-\\d+\\.json$`).test(f)))
      Object.assign(tags, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  const altFile = `${root}data/readings/n${n}.json`
  const alt = existsSync(altFile) ? JSON.parse(readFileSync(altFile, 'utf8')) : {}
  let tagged = 0
  let aligned = 0
  const cols = Array.from({ length: count }, (_, i) => {
    const t = tags[i] ?? {}
    if (t.k) tagged++
    let a = ''
    if (['S', 'F', 'J'].includes(t.k) && t.rt === 'on' && t.sk) {
      const { core, coreReading } = parseEntry(words[i][0], words[i][1])
      a = alignOn(core, coreReading, kanjiTable)?.join('|') ?? ''
      if (a) aligned++
    }
    const x = t.k === 'S' ? (alt[i] ?? []).join(' ') : ''
    const row = [o[i], freq[i] ?? 0, ...TAG_FIELDS.map((k) => t[k] ?? ''), a, x]
    while (row.length > 2 && row[row.length - 1] === '') row.pop()
    return row
  })
  return { cols, tagged, aligned }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const extras = process.argv.includes('--extras')
  const outArg = process.argv.indexOf('--out')
  const outDir = outArg > 0 ? process.argv[outArg + 1].replace(/\/?$/, '/') : `${root}public/data/`
  mkdirSync(outDir, { recursive: true })
  const koFiles = readdirSync(`${root}data/ko`)
  for (const n of [5, 4, 3, 2, 1]) {
    const words = loadLevel(n)
    const ko = {}
    for (const f of koFiles.filter((f) => f.startsWith(`n${n}-`) && f.endsWith('.json')))
      Object.assign(ko, JSON.parse(readFileSync(`${root}data/ko/${f}`, 'utf8')))
    let missing = 0
    // [expression, reading, korean ('' if none), english]
    const out = words.map(([e, r, en], i) => {
      const k = (ko[i] ?? '').trim()
      if (!k) missing++
      return [e, r === e ? '' : r, k, en]
    })
    let note = ''
    if (extras) {
      const { cols, tagged, aligned } = extraColumns(n, out.length, words)
      out.forEach((row, i) => row.push(...cols[i]))
      note = `, extras: order+freq for all, tags for ${tagged}, reading split for ${aligned}`
    }
    writeFileSync(`${outDir}n${n}.json`, JSON.stringify(out))
    console.log(`N${n}: ${out.length} words, ${missing} without Korean${note}`)
  }
}
