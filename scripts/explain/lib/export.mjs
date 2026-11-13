// App-facing output: data/explain/dist/<level>/<shard>.json + manifest.json.
// A shard holds the words whose idx falls in [shard*100, shard*100+99], keyed by idx. The app (or the Worker
// behind GET /explain/:wordId) fetches one ~100-word shard for any word, so a single lookup never loads a
// whole level (N1 alone is ~2 MB raw by estimate) and the file count stays small (84 shards for 8,130 words).

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { LEVELS, PROMPT_VERSION, SCHEMA_VERSION } from './config.mjs'

export const SHARD_SIZE = 100
export const shardOf = (idx) => Math.floor(idx / SHARD_SIZE)
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
  for (const level of LEVELS) {
    const lw = words.filter((w) => w.level === level)
    if (!lw.length) continue
    const byShard = new Map()
    let exported = 0
    for (const w of lw) {
      const it = items[w.id]
      if (!it) continue
      const s = shardOf(w.idx)
      if (!byShard.has(s)) byShard.set(s, {})
      byShard.get(s)[w.idx] = appItem(it.output)
      models[it.meta.model] = (models[it.meta.model] || 0) + 1
      exported++
    }
    for (const [s, entries] of [...byShard].sort((a, b) => a[0] - b[0])) {
      const rel = `${level}/${shardName(s)}.json`
      const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, level, from: s * SHARD_SIZE, items: entries })
      const f = path.join(distDir, rel)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, body)
      const bytes = Buffer.byteLength(body)
      const gz = zlib.gzipSync(body, { level: 9 }).length
      totalBytes += bytes
      totalGzip += gz
      shards.push({ path: rel, count: Object.keys(entries).length, bytes, gzipBytes: gz })
    }
    const missing = lw.filter((w) => !items[w.id]).map((w) => w.id)
    levels[level] = { total: lw.length, exported, missing: missing.length, missingIds: missing.length <= 50 ? missing : missing.slice(0, 50) }
  }
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    generated: date,
    models,
    shardSize: SHARD_SIZE,
    idFormat: '<level>-<idx>; shard = floor(idx / shardSize); file = <level>/<shard 3 digits>.json; entry = items[idx]',
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
