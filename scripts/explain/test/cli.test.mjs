import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { main, parseArgs } from '../cli.mjs'
import { shardOf } from '../lib/export.mjs'
import { Store } from '../lib/store.mjs'
import { GOOD, mutate } from './fixtures/outputs.mjs'
import { mockClient, quiet, tmpRepo } from './helpers.mjs'

const throwingClient = new Proxy({}, { get() { throw new Error('dry-run must not touch the client') } })
const env = (root, client, lines = []) => ({ root, client, log: (m) => lines.push(m), sleep: async () => {} })

test('parseArgs: flags, lists, numbers, bad level', () => {
  const a = parseArgs(['run', '--levels', 'n5,N4', '--limit', '3', '--ids=n5-1,n5-2', '--dry-run'])
  assert.deepEqual([a._[0], a.levels, a.limit, a.ids, a['dry-run']], ['run', ['n5', 'n4'], 3, ['n5-1', 'n5-2'], true])
  assert.throws(() => parseArgs(['run', '--levels', 'n6']))
})

test('--dry-run builds requests, prints an estimate and sends nothing', async () => {
  const root = tmpRepo()
  const lines = []
  const r = await main(['run', '--dry-run', '--levels', 'n5', '--limit', '4'], env(root, throwingClient, lines))
  assert.equal(r.requests, 4)
  const preview = fs.readFileSync(path.join(root, 'data/explain/work/requests-preview.jsonl'), 'utf8').trim().split('\n')
  assert.equal(preview.length, 4)
  assert.equal(JSON.parse(preview[0]).custom_id, 'n5-0')
  assert.ok(lines.some((l) => /캐시 적중 50%/.test(l)))
  assert.ok(lines.some((l) => /heuristic/.test(l)))
  assert.ok(!fs.existsSync(path.join(root, 'data/explain/work/state.json')), 'no state written by a dry run')
})

test('without a key the CLI refuses network commands', async () => {
  const root = tmpRepo()
  const saved = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  await assert.rejects(main(['run', '--sample', '2'], { root, log: quiet }), /ANTHROPIC_API_KEY/)
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
})

test('sample → full run → validate → retry → review → export, end to end on the mock', async () => {
  const root = tmpRepo()
  let broken = true
  const client = mockClient((id) => (broken && id === 'n4-1' ? mutate('n4-1', (o) => (o.examples[0].ja = '毎日日本語を読みます。')) : GOOD[id]))
  const lines = []
  const e = env(root, client, lines)

  // sample: synchronous, stratified, review sheet written, estimate now uses measured usage
  const tally = await main(['run', '--sample', '3'], e)
  assert.equal(Object.values(tally).reduce((s, x) => s + x, 0), 3)
  assert.equal(client.calls.create, 0)
  assert.ok(fs.existsSync(path.join(root, 'data/explain/review/sample.html')))
  assert.ok(lines.some((l) => /measured/.test(l)))

  // full run: the remaining words go out as a batch, sample words are not re-sent
  await main(['run'], e)
  assert.equal(client.calls.create, 1)
  assert.equal(client.calls.requests.length, 8 - 3)
  const store = new Store(root)
  assert.ok(store.failed['n4-1'], 'n4-1 failed validation (headword missing)')

  // retry: only the failed id
  broken = false
  const before = client.calls.requests.length + client.calls.sync
  await main(['retry'], e)
  assert.equal(client.calls.requests.length + client.calls.sync - before, 1)
  assert.equal(Object.keys(new Store(root).accepted).length, 8)

  // a tag that changes after generation sends the word back to the retry list
  const tagFile = path.join(root, 'data/tags/n5-1.json')
  const tags = JSON.parse(fs.readFileSync(tagFile, 'utf8'))
  tags['1'] = { k: 'S', sk: '정', rt: 'kun' }
  fs.writeFileSync(tagFile, JSON.stringify(tags))
  const v = await main(['validate'], e)
  assert.equal(v.failed, 1)
  assert.equal(v.codes['tag-changed'], 1)
  assert.match(new Store(root).failed['n5-1'].reasons.join(), /tag-changed/)
  tags['1'] = { k: 'N', rt: 'kun' }
  fs.writeFileSync(tagFile, JSON.stringify(tags))
  await main(['retry', '--sync'], e)

  // review sheet: stratified sample, TSV with verdict column
  const rv = await main(['review', '--per-cell', '1'], e)
  const tsv = fs.readFileSync(rv.tsv, 'utf8').trim().split('\n')
  assert.ok(tsv[0].split('\t').includes('verdict'))
  assert.ok(rv.rows >= 5)
  const all = await main(['review', '--levels', 'n4', '--all'], e)
  assert.equal(all.rows, 2)

  // export: shards + manifest
  const m = await main(['export'], e)
  assert.equal(m.totals.exported, 8)
  assert.equal(m.counts.n5.exported, 6)
  const shard = JSON.parse(fs.readFileSync(path.join(root, 'data/explain/dist/n5/000.json'), 'utf8'))
  assert.equal(shard.schemaVersion, 1)
  assert.deepEqual(shard.items['1'].examples, GOOD['n5-1'].examples)
  assert.ok(!('meaningFlag' in shard.items['1']), 'editor field not exported')
  assert.ok(!('trap' in shard.items['1']), 'empty optional fields omitted')
  assert.equal(shard.items['0'].trap, GOOD['n5-0'].trap)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/explain/dist/manifest.json'), 'utf8'))
  assert.equal(manifest.models['claude-sonnet-5-5'], 8)
  assert.ok(manifest.generated && manifest.promptVersion)
  assert.equal(shardOf(2699), 26)
})

test('regen replaces one word synchronously', async () => {
  const root = tmpRepo()
  const client = mockClient((id) => GOOD[id])
  await main(['run'], env(root, client))
  await main(['regen', '--ids', 'n5-4'], env(root, client))
  assert.equal(client.calls.sync, 1)
  assert.equal(new Store(root).accepted['n5-4'].meta.mode, 'sync')
})

test('adopt resolves an interrupted submission', async () => {
  const root = tmpRepo()
  const store = new Store(root)
  store.state.pendingSubmit = { ids: ['n5-0', 'n5-1'], startedAt: 'x', purpose: 'main' }
  store.saveState()
  const client = mockClient((id) => GOOD[id])
  await assert.rejects(main(['run'], env(root, client)), /adopt/)
  await main(['adopt', '--none'], env(root, client))
  assert.equal(new Store(root).state.pendingSubmit, null)
})

test('validate --stale-prompt sends outputs from an older prompt version back; review --share samples a fraction', async () => {
  const root = tmpRepo()
  const client = mockClient((id) => GOOD[id])
  await main(['run'], env(root, client))
  const store = new Store(root)
  store.accepted['n5-4'].meta.promptVersion = 'old'
  store.saveAccepted()
  assert.equal((await main(['validate'], env(root, client))).failed, 0)
  const v = await main(['validate', '--stale-prompt'], env(root, client))
  assert.deepEqual([v.failed, v.codes['prompt-changed']], [1, 1])
  const r = await main(['review', '--share', '0.25'], env(root, client))
  assert.equal(r.rows, 2) // ceil(0.25 × 8) = 2, from 7 accepted words
})
