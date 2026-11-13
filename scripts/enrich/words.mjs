// Shared word access for the enrichment scripts.
// `node scripts/enrich/words.mjs` prints every level as JSON (used by freq.py):
//   { "5": [ { idx, expr, reading, ko, en, forms, readings, affix, core, coreReading }, ... ], ... }
// idx is the existing word index from build-data.mjs (never changes).
import { readFileSync, readdirSync } from 'node:fs'
import { loadLevel } from '../build-data.mjs'
import { parseEntry } from './forms.mjs'

export const root = new URL('../..', import.meta.url).pathname
export const LEVELS = [5, 4, 3, 2, 1]

export function loadKo(n) {
  const ko = {}
  for (const f of readdirSync(`${root}data/ko`).filter((f) => f.startsWith(`n${n}-`) && f.endsWith('.json')))
    Object.assign(ko, JSON.parse(readFileSync(`${root}data/ko/${f}`, 'utf8')))
  return ko
}

export function levelWords(n) {
  const ko = loadKo(n)
  return loadLevel(n).map(([expr, reading, en], idx) => ({
    idx,
    expr,
    reading,
    ko: (ko[idx] ?? '').trim(),
    en,
    ...parseEntry(expr, reading),
  }))
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const out = {}
  for (const n of LEVELS) out[n] = levelWords(n)
  process.stdout.write(JSON.stringify(out))
}
