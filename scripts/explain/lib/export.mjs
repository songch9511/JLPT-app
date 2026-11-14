// App-facing output: data/explain/dist/<shard>.json + manifest.json.
// A shard holds the words whose stable id (docs/plan/08 §7: `w` + base-36 counter) has a counter in
// [shard*100, shard*100+99], keyed by id. The app (or the Worker behind GET /explain/:wordId) computes the shard
// from the id alone and fetches one ~100-word file, so a single lookup never loads a whole level (N1 alone is
// ~2 MB raw by estimate) and the file count stays small (82 shards for 8,130 words). A word moving to another
// level keeps its id and so its shard.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { LEVELS, PROMPT_VERSION, SCHEMA_VERSION } from './config.mjs'

export const SHARD_SIZE = 100
/** The counter of a stable word id (`w0k3` → 723). */
export const counterOf = (id) => parseInt(id.slice(1), 36)
/** The shard of a stable word id. */
export const shardOf = (id) => Math.floor(counterOf(id) / SHARD_SIZE)
export const shardName = (n) => String(n).padStart(3, '0')

/** Fields the learner sees. meaningFlag is an editor note and is not exported. */
export function appItem(output) {
  const { examples, kanji, tip, trap, related, origin } = output
  return {
    examples,
    kanji,
    tip,
    ...(trap ? { trap } : {}),
    related,
    ...(origin ? { origin } : {}),
  }
}

/**
 * @param {import('./words.mjs').Word[]} words all words (to know totals and shard ranges)
 * @param {Record<string, {output: any, meta: any}>} items exportable items (already re-validated)
 * @param {string} distDir
 */
export function exportAll(words, items, distDir, { date = new Date().toISOString().slice(0, 10) } = {}) {
  fs.rmSync(distDir, { recursive: true, force: true })
  const levels = {}
  const shards = []
  const models = {}
  let totalBytes = 0, totalGzip = 0
  const byShard = new Map()
  for (const level of LEVELS) {
    const lw = words.filter((w) => w.level === level)
    if (!lw.length) continue
    let exported = 0
    for (const w of lw) {
      const it = items[w.id]
      if (!it) continue
      const s = shardOf(w.id)
      if (!byShard.has(s)) byShard.set(s, {})
      byShard.get(s)[w.id] = appItem(it.output)
      models[it.meta.model] = (models[it.meta.model] || 0) + 1
      exported++
    }
    const missing = lw.filter((w) => !items[w.id]).map((w) => w.id)
    levels[level] = { total: lw.length, exported, missing: missing.length, missingIds: missing.length <= 50 ? missing : missing.slice(0, 50) }
  }
  for (const [s, unordered] of [...byShard].sort((a, b) => a[0] - b[0])) {
    const entries = Object.fromEntries(Object.entries(unordered).sort(([a], [b]) => counterOf(a) - counterOf(b)))
    const rel = `${shardName(s)}.json`
    const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, from: s * SHARD_SIZE, items: entries })
    const f = path.join(distDir, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const bytes = Buffer.byteLength(body)
    const gz = zlib.gzipSync(body, { level: 9 }).length
    totalBytes += bytes
    totalGzip += gz
    shards.push({ path: rel, count: Object.keys(entries).length, bytes, gzipBytes: gz })
  }
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    generated: date,
    models,
    shardSize: SHARD_SIZE,
    idFormat: "stable word id 'w' + base-36 counter (docs/plan/08 §7); shard = floor(counter / shardSize); file = <shard 3 digits>.json; entry = items[id]",
    counts: levels,
    totals: {
      words: words.length,
      exported: Object.values(levels).reduce((s, l) => s + l.exported, 0),
      bytes: totalBytes,
      gzipBytes: totalGzip,
    },
    shards,
    credit: 'AI-generated study content (Anthropic Claude), reviewed by the publisher. Word list: tanos.co.uk (Jonathan Waller, CC BY) via open-anki-jlpt-decks (MIT).',
  }
  fs.mkdirSync(distDir, { recursive: true })
  fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
  return manifest
}
