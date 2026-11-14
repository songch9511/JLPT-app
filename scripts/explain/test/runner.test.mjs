import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { CONFIG } from '../lib/config.mjs'
import { classify } from '../lib/results.mjs'
import { collect, pending, PendingSubmitError, resume, retryOptFor, retryable, runSync, submit } from '../lib/runner.mjs'
import { Store } from '../lib/store.mjs'
import { GOOD, mutate, succeeded } from './fixtures/outputs.mjs'
import { fixtureWords, mockClient, quiet, tmpRepo } from './helpers.mjs'

const { words, byId } = fixtureWords()
const noSleep = async () => {}

test('classify: every result type and stop reason', () => {
  assert.equal(classify(succeeded('w001', GOOD['w001']), byId).status, 'ok')
  const ref = classify(succeeded('w001', null, { stop: 'refusal' }), byId)
  assert.equal(ref.status, 'refusal')
  assert.match(ref.detail, /cyber/)
  assert.equal(classify(succeeded('w001', GOOD['w001'], { stop: 'max_tokens' }), byId).status, 'max_tokens')
  assert.equal(classify(succeeded('w001', '{"examples": [', {}), byId).status, 'invalid_json')
  const inv = classify(succeeded('w001', mutate('w001', (o) => (o.tip = '')), {}), byId)
  assert.equal(inv.status, 'invalid')
  assert.ok(inv.output)
  const e1 = classify({ custom_id: 'w001', result: { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error' } } } }, byId)
  assert.deepEqual([e1.status, e1.retryable], ['errored', true])
  const e2 = classify({ custom_id: 'w001', result: { type: 'errored', error: { type: 'error', error: { type: 'invalid_request_error' } } } }, byId)
  assert.deepEqual([e2.status, e2.retryable], ['errored', false])
  assert.equal(classify({ custom_id: 'w001', result: { type: 'expired' } }, byId).status, 'expired')
  assert.equal(classify({ custom_id: 'w001', result: { type: 'canceled' } }, byId).status, 'canceled')
  assert.equal(classify({ custom_id: 'zzz', result: { type: 'expired' } }, byId).status, 'unknown-id')
})

test('batch results in arbitrary order are merged by custom_id', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  const client = mockClient((id) => GOOD[id]) // mock shuffles result order
  await submit(client, store, words, { log: quiet })
  const batch = store.state.batches[0]
  assert.notDeepEqual(client.batches.get(batch.id).lines.map((l) => l.custom_id), batch.ids, 'mock really shuffled')
  await resume(client, store, byId, { sleep: noSleep, log: quiet })
  for (const w of words) assert.deepEqual(store.accepted[w.id].output, GOOD[w.id], w.id)
  assert.equal(Object.keys(store.failed).length, 0)
  // persisted per id group (`w` + first counter digit), and readable by a fresh Store
  const again = new Store(root)
  assert.equal(Object.keys(again.accepted).length, words.length)
  assert.ok(fs.existsSync(path.join(root, 'data/explain/work/accepted/w0.json')))
  assert.equal(again.usage.length, words.length)
  assert.equal(fs.readFileSync(path.join(root, `data/explain/work/raw/${batch.id}.jsonl`), 'utf8').trim().split('\n').length, words.length)
})

test('failures go to the retry list with reasons; missing and unexpected ids are handled', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  const client = mockClient((id) => {
    if (id === 'w000') return { line: succeeded('w000', null, { stop: 'refusal' }) }
    if (id === 'w001') return mutate('w001', (o) => (o.examples[0].kana = 'ていにはながあります。'))
    if (id === 'w002') return { line: { result: { type: 'expired' } } }
    if (id === 'w003') return { line: succeeded('w003', GOOD['w003'], { stop: 'max_tokens' }) }
    return GOOD[id]
  })
  await submit(client, store, words, { log: quiet })
  const b = client.batches.get(store.state.batches[0].id)
  b.lines = b.lines.filter((l) => l.custom_id !== 'w0k1') // a result that never arrives
  b.lines.push({ custom_id: 'w999', result: { type: 'expired' } }) // one we never sent
  await resume(client, store, byId, { sleep: noSleep, log: quiet })
  assert.equal(store.failed['w000'].status, 'refusal')
  assert.equal(store.failed['w001'].status, 'invalid')
  assert.match(store.failed['w001'].reasons.join(), /headword-reading-missing/)
  assert.equal(store.failed['w002'].status, 'expired')
  assert.equal(store.failed['w003'].status, 'max_tokens')
  assert.equal(store.failed['w0k1'].status, 'missing')
  assert.ok(!store.failed['w999'] && !store.accepted['w999'])
  assert.ok(store.accepted['w004'])
})

test('retry selection: only failed, retryable, under the attempt cap; params per reason; only failed ids are re-sent', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  let firstRound = true
  const client = mockClient((id, params) => {
    if (firstRound && id === 'w000') return { line: succeeded('w000', null, { stop: 'refusal' }) }
    if (firstRound && id === 'w003') return { line: succeeded('w003', GOOD['w003'], { stop: 'max_tokens' }) }
    if (firstRound && id === 'w002') return { line: { result: { type: 'errored', error: { type: 'error', error: { type: 'invalid_request_error' } } } } }
    return GOOD[id]
  })
  await submit(client, store, words, { log: quiet })
  await resume(client, store, byId, { sleep: noSleep, log: quiet })
  firstRound = false

  const todo = retryable(store, words).map((w) => w.id).sort()
  assert.deepEqual(todo, ['w000', 'w003']) // w002 (invalid_request_error) is not auto-retryable
  const optFor = retryOptFor(store)
  assert.equal(optFor(byId.get('w000')).model, CONFIG.fallbackModel)
  assert.equal(optFor(byId.get('w003')).maxTokens, CONFIG.maxTokens * 2)

  const before = client.calls.requests.length
  await submit(client, store, retryable(store, words), { optFor, purpose: 'retry', log: quiet })
  const sent = client.calls.requests.slice(before)
  assert.deepEqual(sent.map((r) => r.custom_id).sort(), ['w000', 'w003'])
  assert.equal(sent.find((r) => r.custom_id === 'w000').params.model, 'claude-sonnet-5')
  assert.equal(sent.find((r) => r.custom_id === 'w003').params.max_tokens, 8000)
  await resume(client, store, byId, { sleep: noSleep, log: quiet })
  assert.ok(store.accepted['w000'] && store.accepted['w003'])
  assert.equal(store.accepted['w000'].meta.model, 'claude-sonnet-5')
  assert.deepEqual(Object.keys(store.failed), ['w002'])

  // attempt cap
  store.failed['w001'] = { status: 'invalid', retryable: true, reasons: [] }
  store.state.attempts['w001'] = CONFIG.maxAttempts
  assert.ok(!retryable(store, words).some((w) => w.id === 'w001'))
})

test('resume: an interrupted run collects its open batch instead of resubmitting', async () => {
  const root = tmpRepo()
  const client = mockClient((id) => GOOD[id], { endAfterPolls: 3 })
  // run 1: submit, check once without waiting, then "crash"
  const s1 = new Store(root)
  await submit(client, s1, words, { log: quiet })
  const done = await resume(client, s1, byId, { wait: false, log: quiet })
  assert.equal(done, false)
  assert.equal(client.calls.create, 1)

  // run 2: fresh process, same disk state
  const s2 = new Store(root)
  assert.equal(s2.openBatches().length, 1)
  assert.equal(pending(s2, words).length, 0, 'in-flight words are not pending')
  await resume(client, s2, byId, { sleep: noSleep, log: quiet })
  assert.equal(client.calls.create, 1, 'nothing resubmitted')
  assert.equal(Object.keys(s2.accepted).length, words.length)
  assert.equal(pending(s2, words).length, 0)
  assert.ok(s2.state.batches[0].collectedAt)

  // collecting the same batch twice is idempotent (crash during collection)
  await collect(client, s2, s2.state.batches[0], byId, { log: quiet })
  assert.equal(Object.keys(s2.accepted).length, words.length)
  assert.equal(fs.readFileSync(path.join(root, `data/explain/work/raw/${s2.state.batches[0].id}.jsonl`), 'utf8').trim().split('\n').length, words.length)
})

test('resume: a crash between "submit started" and "batch id saved" blocks resubmission', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  const client = mockClient((id) => GOOD[id])
  client.messages.batches.create = async () => { throw new Error('process killed') }
  await assert.rejects(submit(client, store, words, { log: quiet }))
  const again = new Store(root)
  assert.ok(again.state.pendingSubmit)
  await assert.rejects(resume(mockClient((id) => GOOD[id]), again, byId, { log: quiet }), PendingSubmitError)
  await assert.rejects(submit(mockClient((id) => GOOD[id]), again, words, { log: quiet }), PendingSubmitError)
})

test('sync path (sample / regen) uses the same params and the same classification', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  let t = 0
  const client = mockClient((id) => (id === 'w001' ? mutate('w001', (o) => (o.related = [])) : GOOD[id]))
  const tally = await runSync(client, store, [byId.get('w001'), byId.get('w004')], { log: quiet, clock: () => (t += 1500) })
  assert.deepEqual(tally, { invalid: 1, ok: 1 })
  assert.equal(client.calls.sync, 2)
  assert.equal(client.calls.create, 0)
  assert.equal(store.usage[0].ms, 1500)
  assert.equal(store.accepted['w004'].meta.mode, 'sync')
  assert.match(store.failed['w001'].reasons.join(), /count@related/)
})
