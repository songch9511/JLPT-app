import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hash, loadWords } from '../lib/words.mjs'
import { succeeded } from './fixtures/outputs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURE_ROOT = path.join(here, 'fixtures/repo')

/** Fresh copy of the fixture repo in a temp dir (each test gets its own data/explain). */
export function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-test-'))
  fs.cpSync(FIXTURE_ROOT, dir, { recursive: true })
  return dir
}

export function fixtureWords() {
  const words = loadWords({ root: FIXTURE_ROOT })
  return { words, byId: new Map(words.map((w) => [w.id, w])) }
}

/**
 * In-memory stand-in for the Anthropic client. No network.
 * `respond(id, params, attempt)` returns the output object (or a full result line via {line}) for one request.
 */
export function mockClient(respond, { shuffle = true, endAfterPolls = 1 } = {}) {
  const batches = new Map()
  const calls = { create: 0, retrieve: 0, results: 0, sync: 0, countTokens: 0, requests: [] }
  let n = 0
  const attempts = {}
  const lineFor = (custom_id, params) => {
    attempts[custom_id] = (attempts[custom_id] || 0) + 1
    const r = respond(custom_id, params, attempts[custom_id])
    if (r && r.line) return { custom_id, ...r.line }
    return succeeded(custom_id, r, { model: params.model })
  }
  return {
    calls,
    batches,
    messages: {
      batches: {
        async create({ requests }) {
          calls.create++
          calls.requests.push(...requests)
          const id = `msgbatch_${++n}`
          let lines = requests.map((r) => lineFor(r.custom_id, r.params))
          if (shuffle) lines = lines.map((l) => [hash('order' + l.custom_id), l]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
          batches.set(id, { lines, polls: 0 })
          return { id, processing_status: 'in_progress' }
        },
        async retrieve(id) {
          calls.retrieve++
          const b = batches.get(id)
          if (!b) throw new Error('no such batch ' + id)
          b.polls++
          const ended = b.polls >= endAfterPolls
          return { id, processing_status: ended ? 'ended' : 'in_progress', request_counts: { processing: ended ? 0 : b.lines.length, succeeded: 0, errored: 0 } }
        },
        async results(id) {
          calls.results++
          const b = batches.get(id)
          return (async function* () { for (const l of b.lines) yield l })()
        },
        async list() { return { data: [] } },
      },
      async create(params) {
        calls.sync++
        const line = lineFor(findId(params), params)
        if (line.result.type !== 'succeeded') {
          const e = new Error('api error'); e.status = 500; e.error = line.result.error; throw e
        }
        return line.result.message
      },
      async countTokens(params) {
        calls.countTokens++
        return { input_tokens: params.messages[0].content === '.' ? 1800 : 1890 }
      },
    },
  }
}

// The sync path has no custom_id; recover the word id from the word data in the user message.
let idIndex = null
function findId(params) {
  if (!idIndex) {
    const { words } = fixtureWords()
    idIndex = new Map(words.map((w) => [`${w.level.toUpperCase()}|${w.w}`, w.id]))
  }
  const data = JSON.parse(params.messages[0].content.replace(/^<word>\n|\n<\/word>$/g, ''))
  return idIndex.get(`${data.level}|${data.word}`)
}

export const quiet = () => {}
