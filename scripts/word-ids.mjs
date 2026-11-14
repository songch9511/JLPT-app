// Stable word ids (docs/plan/08-word-data.md §7). Every word has an id issued once and recorded in
// data/ids.json; the id never depends on where the word sits in the source, so adding, removing, re-ordering,
// correcting or moving words between levels never re-attaches a learner's records to another word.
//
// Rules (enforced by `resolve`, which build-data.mjs runs on every build):
// - An id is `w` + a base-36 counter, at least 3 digits (`w000`, `w0k3`, `w1zz`). Issued from `next`, which
//   only grows. An id is never reused, never re-issued, never changed.
// - A registry entry says which source row the id belongs to: level `l`, headword `w` and reading `r`, exactly as
//   in data/raw/n{l}.csv after trimming. Within a level that pair is unique (the build already merged duplicate
//   rows within a level, first one kept). The same pair in two levels is two words with two ids (96 such pairs today).
// - Fixing a typo in a headword/reading or moving a word to another level: edit `w`/`r`/`l` of its entry (the
//   id stays). Removing a word: give its entry `"retired": "<date>: <why>"` (a tombstone; the id is kept and
//   never reissued). A retired word that comes back: delete the `retired` field (learners' records return).
// - `legacy` is the positional id `<level>-<idx>` the app used before stable ids, for the 8,130 words that
//   existed then. It is frozen: the app's one-time migration (src/generated/word-ids.ts) is generated from it.
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
export const REGISTRY = `${root}data/ids.json`
export const LEVELS = [5, 4, 3, 2, 1]

export const ID_RE = /^w[0-9a-z]{3,}$/
export const idOf = (n) => 'w' + n.toString(36).padStart(3, '0')
export const counterOf = (id) => (ID_RE.test(id) && idOf(parseInt(id.slice(1), 36)) === id ? parseInt(id.slice(1), 36) : -1)

export function parseCsv(text) {
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

/**
 * The words of a level's source CSV in file order: { w, r, en }, trimmed, rows without a headword skipped and a
 * repeated headword+reading within the level dropped (the first is kept; `dropped` lists the others).
 */
export function readSource(l, text = readFileSync(`${root}data/raw/n${l}.csv`, 'utf8')) {
  const seen = new Set()
  const out = []
  out.dropped = []
  for (const [expr = '', reading = '', meaning = ''] of parseCsv(text).slice(1)) {
    const w = expr.trim(), r = reading.trim()
    if (!w) continue
    const key = `${w}\t${r}`
    if (seen.has(key)) { out.dropped.push({ w, r }); continue }
    seen.add(key)
    out.push({ w, r, en: meaning.trim() })
  }
  return out
}

export const loadRegistry = (path = REGISTRY) => JSON.parse(readFileSync(path, 'utf8'))

/** The registry as text: one id per line, so a diff shows exactly which ids were added, changed or retired. */
export function formatRegistry(reg) {
  const lines = Object.entries(reg.ids).map(([id, e]) => `${JSON.stringify(id)}:${JSON.stringify(e)}`)
  return `{\n"format":1,\n"next":${reg.next},\n"ids":{\n${lines.join(',\n')}\n}\n}\n`
}

const keyOf = (l, w, r) => `${l}\t${w}\t${r}`

/**
 * Attaches the registered id to every source word and checks the registry. Returns the words of each level in
 * id order (issue order: existing words keep their place, new words come last) and every problem found; the
 * build refuses to write anything while `errors` is not empty.
 *   sources: { [level]: [{ w, r, en }] } (readSource)
 */
export function resolve(sources, reg) {
  const errors = []
  const live = new Map() // key -> id
  const counter = new Map() // id -> counter
  const retired = new Map()
  if (!reg || reg.format !== 1 || !Number.isInteger(reg.next) || typeof reg.ids !== 'object') return { errors: ['data/ids.json: not a format-1 registry'], levels: {} }
  for (const [id, e] of Object.entries(reg.ids)) {
    const n = counterOf(id)
    counter.set(id, n)
    if (n < 0) errors.push(`${id}: not a well-formed id (w + base-36 counter, at least 3 digits, no leading zeros beyond 3)`)
    else if (n >= reg.next) errors.push(`${id}: counter ${n} is not below "next" (${reg.next}); ids are issued from "next" only`)
    if (!LEVELS.includes(e?.l) || typeof e.w !== 'string' || !e.w || typeof e.r !== 'string') { errors.push(`${id}: entry needs l (1-5), w and r`); continue }
    if (e.legacy !== undefined && !/^[1-5]-(0|[1-9]\d*)$/.test(e.legacy)) errors.push(`${id}: legacy must be <level>-<idx>`)
    const key = keyOf(e.l, e.w, e.r)
    const map = e.retired ? retired : live
    if (!e.retired && live.has(key)) errors.push(`${id} and ${live.get(key)} both claim N${e.l} ${e.w}|${e.r}: one word, one id (retire one, or tell them apart in the source)`)
    if (!e.retired || !retired.has(key)) map.set(key, id)
  }
  const legacySeen = new Map()
  for (const [id, e] of Object.entries(reg.ids))
    if (e?.legacy) {
      if (legacySeen.has(e.legacy)) errors.push(`legacy id ${e.legacy} is claimed by ${legacySeen.get(e.legacy)} and ${id}`)
      legacySeen.set(e.legacy, id)
    }
  const levels = {}
  const used = new Set()
  for (const l of LEVELS) {
    const words = []
    for (const x of sources[l] ?? []) {
      const key = keyOf(l, x.w, x.r)
      const id = live.get(key)
      if (!id) {
        const old = retired.get(key)
        errors.push(old
          ? `N${l} ${x.w}|${x.r} matches retired id ${old}: delete its "retired" field to bring the word (and learners' records) back`
          : `N${l} ${x.w}|${x.r} has no registered id: a typo fix or level move → edit the existing entry's w/r/l; a new word → node scripts/build-data.mjs --assign-ids`)
        continue
      }
      used.add(id)
      words.push({ id, ...x })
    }
    words.sort((a, b) => counter.get(a.id) - counter.get(b.id))
    levels[l] = words
  }
  for (const [id, e] of Object.entries(reg.ids))
    if (!e?.retired && !used.has(id) && LEVELS.includes(e?.l))
      errors.push(`${id} (N${e.l} ${e.w}|${e.r}) is registered but not in the source: an issued id never disappears — fix its w/r/l if the word was corrected or moved, or retire it ("retired": "<date>: <why>")`)
  return { errors, levels }
}

/** Issues ids to source words that have none (new words). Never touches existing entries. Returns the new ids. */
export function assignNew(sources, reg) {
  const live = new Set(Object.values(reg.ids).filter((e) => !e.retired).map((e) => keyOf(e.l, e.w, e.r)))
  const retired = new Set(Object.values(reg.ids).filter((e) => e.retired).map((e) => keyOf(e.l, e.w, e.r)))
  const added = []
  for (const l of LEVELS)
    for (const x of sources[l] ?? []) {
      const key = keyOf(l, x.w, x.r)
      if (live.has(key) || retired.has(key)) continue
      const id = idOf(reg.next++)
      reg.ids[id] = { l, w: x.w, r: x.r }
      live.add(key)
      added.push(id)
    }
  return added
}

/** All live words of the registry with their levels, in id order: what the app's id table is generated from. */
export const liveIds = (reg) =>
  Object.entries(reg.ids)
    .filter(([, e]) => !e.retired)
    .map(([id, e]) => ({ id, l: e.l, n: counterOf(id) }))
    .sort((a, b) => a.n - b.n)
