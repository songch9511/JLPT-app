// Shared word access for the enrichment scripts.
// `node scripts/enrich/words.mjs` prints every level as JSON (used by freq.py and kanji-table.py):
//   { "5": [ { id, seq, expr, reading, ko, en, forms, readings, affix, core, coreReading }, ... ], ... }
// id is the word's stable id from data/ids.json (docs/plan/08 §7); every enrichment file is keyed by it.
// seq is the word's place in the level in id order (the order of the data files; ties in the frequency order
// are broken by it) and is not an identity.
import { readFileSync, readdirSync } from 'node:fs'
import { loadWords } from '../build-data.mjs'
import { parseEntry } from './forms.mjs'

export const root = new URL('../..', import.meta.url).pathname
export const LEVELS = [5, 4, 3, 2, 1]

/** Korean meanings by word id, from every data/ko file (a file groups words; the keys decide). */
export function loadKo() {
  const ko = {}
  for (const f of readdirSync(`${root}data/ko`).filter((f) => /^n[1-5]-\d+\.json$/.test(f)))
    Object.assign(ko, JSON.parse(readFileSync(`${root}data/ko/${f}`, 'utf8')))
  return ko
}

let words
/** The words of a level, in id order. Fails (like the build) when data/ids.json does not match the source. */
export function levelWords(n) {
  words ??= loadWords()
  const ko = loadKo()
  return words[n].map(({ id, w: expr, r: reading, en }, seq) => ({
    id,
    seq,
    expr,
    reading,
    ko: (ko[id] ?? '').trim(),
    en,
    ...parseEntry(expr, reading),
  }))
}

/** A level's words by id. */
export const levelById = (n) => new Map(levelWords(n).map((w) => [w.id, w]))

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const out = {}
  for (const n of LEVELS) out[n] = levelWords(n)
  process.stdout.write(JSON.stringify(out))
}
