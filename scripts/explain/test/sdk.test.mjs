// Runs the real SDK (installed by `npm ci`) against a fake fetch: no network, no key. Checks that the calls
// the runner makes exist in SDK 1.8.0, what goes over the wire, and that results() decodes JSONL into lines
// the classifier understands. Skipped when the SDK is not installed.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resume, submit } from '../lib/runner.mjs'
import { Store } from '../lib/store.mjs'
import { GOOD, succeeded } from './fixtures/outputs.mjs'
import { fixtureWords, quiet, tmpRepo } from './helpers.mjs'

let Anthropic = null
try {
  ;({ default: Anthropic } = await import('@anthropic-ai/sdk'))
} catch {}

test('real SDK client against a fake HTTP server: create → retrieve → results', { skip: !Anthropic && 'SDK not installed' }, async () => {
  const { words, byId } = fixtureWords()
  const seen = []
  let sentBody = null
  const fakeFetch = async (url, init = {}) => {
    const u = new URL(String(url))
    seen.push(`${init.method || 'GET'} ${u.pathname}`)
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.pathname === '/v1/messages/batches' && init.method === 'POST') {
      sentBody = JSON.parse(init.body)
      return json({ id: 'msgbatch_fake', type: 'message_batch', processing_status: 'in_progress', request_counts: {} })
    }
    if (u.pathname === '/v1/messages/batches/msgbatch_fake') {
      return json({ id: 'msgbatch_fake', type: 'message_batch', processing_status: 'ended', request_counts: {}, results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_fake/results' })
    }
    if (u.pathname === '/v1/messages/batches/msgbatch_fake/results') {
      const lines = sentBody.requests.map((r) => JSON.stringify(succeeded(r.custom_id, GOOD[r.custom_id]))).reverse()
      return new Response(lines.join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/binary' } })
    }
    return new Response('{}', { status: 404 })
  }
  const client = new Anthropic({ apiKey: 'test-not-a-key', fetch: fakeFetch, maxRetries: 0 })
  const store = new Store(tmpRepo())
  await submit(client, store, words, { log: quiet })
  await resume(client, store, byId, { sleep: async () => {}, log: quiet })
  assert.equal(sentBody.requests.length, words.length)
  assert.equal(sentBody.requests[0].params.model, 'claude-sonnet-5-5')
  assert.equal(sentBody.requests[0].params.output_config.format.type, 'json_schema')
  assert.equal(sentBody.requests[0].params.system[0].cache_control.ttl, '1h')
  assert.ok(seen.includes('POST /v1/messages/batches'))
  assert.ok(seen.some((s) => s.endsWith('/results')))
  assert.equal(Object.keys(store.accepted).length, words.length)
})
