// Loads the word list, the word-type tags and the per-kanji reference table AT RUN TIME.
// Tags are still being labelled and revised, so nothing here is cached between runs: a word without a
// final label gets the machine pre-pass hint, marked as tentative, and the snapshot of the tag used is
// stored with every output so `validate` can find outputs generated under a tag that has since changed.

import fs from 'node:fs'
import path from 'node:path'
import { LEVELS, paths } from './config.mjs'
import { isHan } from './jp.mjs'

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

/** @returns {Map<string, {ko: string[], on: string[], kun: string[]}>} */
export function loadKanji(file) {
  const out = new Map()
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [c, koU = '', koK = '', on = '', kun = ''] = line.split('\t')
    const ko = [...new Set([...koU.split(/\s+/), ...koK.split(/\s+/)].filter(Boolean))]
    out.set(c, { ko, on: on.split(/\s+/).filter(Boolean), kun: kun.split(/\s+/).filter(Boolean) })
  }
  return out
}

/** Final labels from data/tags/n<l>-<p>.json, keyed `<level>-<idx>`. Unparseable files are skipped with a warning. */
export function loadLabels(dir, warn = console.warn) {
  const out = new Map()
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir).sort()) {
    const m = /^(n[1-5])-\d+\.json$/.exec(f)
    if (!m) continue
    let data
    try {
      data = readJson(path.join(dir, f))
    } catch (e) {
      warn(`tags: ${f} 읽기 실패, 건너뜀 (${e.message})`)
      continue
    }
    for (const [idx, t] of Object.entries(data)) if (t && t.k) out.set(`${m[1]}-${idx}`, t)
  }
  return out
}

export function loadPrepass(dir) {
  const out = new Map()
  for (const l of LEVELS) {
    const f = path.join(dir, 'prepass', `${l}.json`)
    if (!fs.existsSync(f)) continue
    for (const [idx, p] of Object.entries(readJson(f))) out.set(`${l}-${idx}`, p)
  }
  return out
}

/**
 * @typedef {{ id: string, level: string, idx: number, w: string, r: string, ko: string, en: string,
 *   tag: { k: string, sk: string, ff: string, rt: string, src: 'label'|'hint'|'none' },
 *   kanji: { c: string, ko: string[], on: string[], kun: string[] }[] }} Word
 */

/** @returns {Word[]} all words of the given levels, in id order */
export function loadWords({ root, levels = LEVELS, warn } = {}) {
  const p = paths(root)
  const kanji = loadKanji(p.kanji)
  const labels = loadLabels(p.tags, warn)
  const prepass = loadPrepass(p.tags)
  const words = []
  for (const level of levels) {
    const f = path.join(p.publicData, `${level}.json`)
    if (!fs.existsSync(f)) continue
    const rows = readJson(f)
    rows.forEach((row, idx) => {
      const [w, r, ko, en] = row
      const id = `${level}-${idx}`
      const lab = labels.get(id)
      const pre = prepass.get(id)
      const tag = lab
        ? { k: lab.k, sk: lab.sk || '', ff: lab.ff || '', rt: lab.rt || '', src: 'label' }
        : pre
          ? { k: pre.auto || pre.hint || '', sk: (pre.sk || [])[0] || '', ff: '', rt: pre.rt || '', src: pre.auto ? 'label' : 'hint' }
          : { k: '', sk: '', ff: '', rt: '', src: 'none' }
      const chars = [...new Set([...w].filter(isHan))]
      words.push({
        id, level, idx, w, r: r || '', ko, en, tag,
        kanji: chars.map((c) => ({ c, ...(kanji.get(c) || { ko: [], on: [], kun: [] }) })),
      })
    })
  }
  return words
}

/** Filter by --ids / --limit. Ids keep the caller's order; --limit takes the first N in id order. */
export function select(words, { ids, limit } = {}) {
  let out = words
  if (ids && ids.length) {
    const byId = new Map(words.map((w) => [w.id, w]))
    const missing = ids.filter((i) => !byId.has(i))
    if (missing.length) throw new Error(`알 수 없는 단어 ID: ${missing.join(', ')}`)
    out = ids.map((i) => byId.get(i))
  }
  if (limit != null) out = out.slice(0, limit)
  return out
}

/**
 * Deterministic stratified sample: round-robin over (level × word type) cells, picking with a seeded hash
 * so the same command always picks the same words.
 */
export function stratified(words, n, seed = 'luma') {
  const cells = new Map()
  for (const w of words) {
    const key = `${w.level}|${w.tag.k || '?'}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(w)
  }
  for (const list of cells.values()) list.sort((a, b) => hash(seed + a.id) - hash(seed + b.id))
  const keys = [...cells.keys()].sort()
  const out = []
  for (let round = 0; out.length < n; round++) {
    let added = false
    for (const k of keys) {
      const list = cells.get(k)
      if (round < list.length && out.length < n) out.push(list[round]), (added = true)
    }
    if (!added) break
  }
  return out
}

export function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}
