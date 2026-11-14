// On-disk state. Everything is plain JSON under data/explain/work so an interrupted run can be resumed and
// inspected by hand:
//   state.json          batches submitted (ids, words in each, collected or not) + a pending-submit marker
//   accepted/<shard>.json outputs that passed validation, with the word/tag snapshot they were generated for
//                       (grouped like the export: `w` + the id's first counter digit, e.g. accepted/w1.json)
//   failed.json         retry list: id → reasons, attempts, last status/model/max_tokens
//   raw/<batch>.jsonl   every raw result line as received (re-validating never needs a paid re-run)
//   usage.json          token usage of every response (measured numbers for the cost estimate)

import fs from 'node:fs'
import path from 'node:path'
import { paths } from './config.mjs'
import { counterOf } from './export.mjs'

const read = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt)
function write(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n')
  fs.renameSync(tmp, f) // atomic replace: a crash never leaves a half-written state file
}

export class Store {
  constructor(root) {
    this.p = paths(root)
    this.state = read(this.p.state, { version: 1, batches: [], pendingSubmit: null, attempts: {} })
    this.state.attempts ||= {}
    this.failed = read(this.p.failed, {})
    this.usage = read(this.p.usage, [])
    this.accepted = {}
    if (fs.existsSync(this.p.accepted))
      for (const f of fs.readdirSync(this.p.accepted)) if (f.endsWith('.json')) Object.assign(this.accepted, read(path.join(this.p.accepted, f), {}))
  }

  saveState() { write(this.p.state, this.state) }
  saveFailed() { write(this.p.failed, this.failed) }
  saveUsage() { write(this.p.usage, this.usage) }
  saveAccepted() {
    const byGroup = {}
    for (const [id, v] of Object.entries(this.accepted)) (byGroup[id.slice(0, 2)] ||= {})[id] = v
    fs.mkdirSync(this.p.accepted, { recursive: true })
    for (const f of fs.readdirSync(this.p.accepted)) if (!byGroup[f.replace('.json', '')]) fs.rmSync(path.join(this.p.accepted, f))
    for (const [group, items] of Object.entries(byGroup)) {
      const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => counterOf(a) - counterOf(b)))
      write(path.join(this.p.accepted, `${group}.json`), sorted)
    }
  }
  saveAll() { this.saveState(); this.saveFailed(); this.saveUsage(); this.saveAccepted() }

  /** A re-collect after a crash re-reads every result; start that batch's raw file over. */
  resetRaw(batchId) {
    const f = path.join(this.p.raw, `${batchId}.jsonl`)
    if (fs.existsSync(f)) fs.rmSync(f)
  }

  appendRaw(batchId, line) {
    fs.mkdirSync(this.p.raw, { recursive: true })
    fs.appendFileSync(path.join(this.p.raw, `${batchId}.jsonl`), JSON.stringify(line) + '\n')
  }

  /** Ids sitting in a submitted batch whose results have not been collected yet. */
  inFlight() {
    const s = new Set()
    for (const b of this.state.batches) if (!b.collectedAt) for (const id of b.ids) s.add(id)
    return s
  }
  openBatches() { return this.state.batches.filter((b) => !b.collectedAt) }
  attempts(id) { return this.state.attempts[id] || 0 }
  bumpAttempt(id) { return (this.state.attempts[id] = this.attempts(id) + 1) }
}
