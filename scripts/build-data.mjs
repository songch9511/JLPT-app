// Builds public/data/n{1..5}.json from data/raw/*.csv (open-anki-jlpt-decks, MIT)
// and Korean meanings in data/ko/n{level}-*.json ({ "<idx>": "뜻" }).
// Word order is a fixed seeded shuffle so that word ids (`<level>-<idx>`) stay stable.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'

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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  mkdirSync(`${root}public/data`, { recursive: true })
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
    writeFileSync(`${root}public/data/n${n}.json`, JSON.stringify(out))
    console.log(`N${n}: ${out.length} words, ${missing} without Korean`)
  }
}
