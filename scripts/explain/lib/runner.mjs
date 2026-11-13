// Submit → poll → collect, with the Anthropic client injected (tests pass a mock; the CLI passes the SDK).
// Resumability rule: a batch id is written to state.json right after `batches.create` returns, and before
// anything waits on it. A later run first finishes every open batch instead of submitting again.

import { CONFIG, PROMPT_VERSION, SCHEMA_VERSION } from './config.mjs'
import { buildParams, buildRequest, retryOptions, toCustomId } from './requests.mjs'
import { classify, reasons } from './results.mjs'

const now = () => new Date().toISOString()
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Store one outcome: accepted output, or an entry in the retry list. Idempotent per id. */
export function record(store, outcome, word, ctx) {
  const { id } = outcome
  if (outcome.usage) {
    const u = outcome.usage
    store.usage.push({
      id, mode: ctx.mode, batchId: ctx.batchId || null, model: outcome.model || ctx.model,
      input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0,
      output: u.output_tokens || 0, thinking: u.output_tokens_details?.thinking_tokens ?? null,
      ms: ctx.ms ?? null, status: outcome.status,
    })
  }
  if (outcome.status === 'ok') {
    store.accepted[id] = {
      output: outcome.output,
      warnings: outcome.warnings || [],
      meta: {
        model: outcome.model || ctx.model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION,
        word: { w: word.w, r: word.r }, tag: { k: word.tag.k, src: word.tag.src },
        attempt: store.attempts(id), mode: ctx.mode, batchId: ctx.batchId || null, at: now(),
      },
    }
    delete store.failed[id]
  } else {
    store.failed[id] = {
      status: outcome.status, reasons: reasons(outcome), retryable: outcome.retryable,
      attempts: store.attempts(id), model: ctx.model, maxTokens: ctx.maxTokens, at: now(),
      ...(outcome.output ? { output: outcome.output } : {}),
    }
  }
}

function optsOf(batch, id) {
  const o = batch.overrides?.[id] || {}
  return { model: o.model || batch.model, maxTokens: o.maxTokens || batch.maxTokens }
}

/**
 * Submit words in chunks. `optFor(word)` gives per-word {model, maxTokens} (retries); default params otherwise.
 * @returns {Promise<string[]>} new batch ids
 */
export async function submit(client, store, words, { optFor = () => ({}), purpose = 'main', log = () => {}, chunk = CONFIG.batchChunk } = {}) {
  if (store.state.pendingSubmit) throw new PendingSubmitError(store.state.pendingSubmit)
  const ids = []
  for (let i = 0; i < words.length; i += chunk) {
    const part = words.slice(i, i + chunk)
    const requests = part.map((w) => buildRequest(w, optFor(w)))
    const overrides = {}
    for (const w of part) {
      const o = optFor(w)
      if ((o.model && o.model !== CONFIG.model) || (o.maxTokens && o.maxTokens !== CONFIG.maxTokens)) overrides[w.id] = o
    }
    store.state.pendingSubmit = { ids: part.map((w) => w.id), startedAt: now(), purpose }
    store.saveState()
    const batch = await client.messages.batches.create({ requests })
    store.state.batches.push({
      id: batch.id, purpose, submittedAt: now(), model: CONFIG.model, maxTokens: CONFIG.maxTokens,
      ids: part.map((w) => w.id), overrides, status: batch.processing_status || 'in_progress', collectedAt: null,
    })
    for (const w of part) store.bumpAttempt(w.id)
    store.state.pendingSubmit = null
    store.saveState()
    log(`batch ${batch.id}: ${part.length}건 제출 (${purpose})`)
    ids.push(batch.id)
  }
  return ids
}

export class PendingSubmitError extends Error {
  constructor(p) {
    super(
      `이전 실행이 배치 제출 도중 멈췄습니다 (${p.startedAt}, ${p.ids.length}건). 배치가 만들어졌는지 콘솔이나 ` +
        '`node cli.mjs status --remote`로 확인한 뒤, 만들어졌으면 `node cli.mjs adopt <batch_id>`, ' +
        '아니면 `node cli.mjs adopt --none`으로 표시를 지우세요. 그대로 다시 제출하면 같은 단어를 두 번 결제할 수 있습니다.',
    )
  }
}

/** Poll one batch until it has ended. With wait=false, check once and return the current status. */
export async function waitFor(client, batchId, { wait = true, sleep = realSleep, pollSeconds = CONFIG.pollSeconds, log = () => {} } = {}) {
  for (;;) {
    const b = await client.messages.batches.retrieve(batchId)
    if (b.processing_status === 'ended' || !wait) return b
    const c = b.request_counts || {}
    log(`batch ${batchId}: ${b.processing_status} (처리 중 ${c.processing ?? '?'}, 성공 ${c.succeeded ?? 0}, 오류 ${c.errored ?? 0})`)
    await sleep(pollSeconds * 1000)
  }
}

/** Read every result of an ended batch, in whatever order they come, and record them. */
export async function collect(client, store, batch, wordsById, { log = () => {} } = {}) {
  store.resetRaw?.(batch.id)
  const expected = new Set(batch.ids)
  const seen = new Set()
  const tally = {}
  for await (const line of await client.messages.batches.results(batch.id)) {
    store.appendRaw(batch.id, line)
    const o = classify(line, wordsById)
    if (!o.id || !expected.has(o.id)) {
      log(`batch ${batch.id}: 예상하지 않은 custom_id ${line?.custom_id} 무시`)
      continue
    }
    if (seen.has(o.id)) continue
    seen.add(o.id)
    const opt = optsOf(batch, o.id)
    record(store, o, wordsById.get(o.id), { mode: 'batch', batchId: batch.id, ...opt })
    tally[o.status] = (tally[o.status] || 0) + 1
  }
  for (const id of expected) {
    if (seen.has(id)) continue
    record(store, { id, status: 'missing', retryable: true, detail: 'no result line for this id' }, wordsById.get(id), { mode: 'batch', batchId: batch.id, ...optsOf(batch, id) })
    tally.missing = (tally.missing || 0) + 1
  }
  batch.status = 'ended'
  batch.collectedAt = now()
  store.saveAll()
  log(`batch ${batch.id} 수집: ${JSON.stringify(tally)}`)
  return tally
}

/** Finish every batch a previous run left open. Returns false if some are still processing (wait=false). */
export async function resume(client, store, wordsById, opt = {}) {
  if (store.state.pendingSubmit) throw new PendingSubmitError(store.state.pendingSubmit)
  let allDone = true
  for (const batch of store.openBatches()) {
    const b = await waitFor(client, batch.id, opt)
    if (b.processing_status !== 'ended') {
      batch.status = b.processing_status
      allDone = false
      continue
    }
    await collect(client, store, batch, wordsById, opt)
  }
  store.saveState()
  return allDone
}

/** Words that still need a first attempt: not accepted, not in an open batch, not already on the retry list. */
export function pending(store, words) {
  const inFlight = store.inFlight()
  return words.filter((w) => !store.accepted[w.id] && !inFlight.has(w.id) && !store.failed[w.id])
}

/** Words on the retry list that may be retried now, with the params each needs. */
export function retryable(store, words, cfg = CONFIG) {
  const inFlight = store.inFlight()
  return words.filter((w) => {
    const f = store.failed[w.id]
    return f && f.retryable && !inFlight.has(w.id) && store.attempts(w.id) < cfg.maxAttempts
  })
}

/** Send words one by one, synchronously (sample mode, single-word regeneration). Same params as the batch. */
export async function runSync(client, store, words, { optFor = () => ({}), log = () => {}, clock = Date.now } = {}) {
  const tally = {}
  for (const w of words) {
    const o = optFor(w)
    const params = buildParams(w, o)
    store.bumpAttempt(w.id)
    const t0 = clock()
    let line
    try {
      const message = await client.messages.create(params)
      line = { custom_id: toCustomId(w.id), result: { type: 'succeeded', message } }
    } catch (e) {
      // the SDK has already retried 429/5xx/connection errors (max_retries) before throwing
      const type = e?.error?.error?.type || e?.error?.type || (e?.status ? `http_${e.status}` : e?.name || 'error')
      line = { custom_id: toCustomId(w.id), result: { type: 'errored', error: { type: 'error', error: { type, message: String(e?.message || e) } } } }
    }
    const ms = clock() - t0
    store.appendRaw('sync', line)
    const outcome = classify(line, new Map([[w.id, w]]))
    record(store, outcome, w, { mode: 'sync', model: params.model, maxTokens: params.max_tokens, ms })
    store.saveAll()
    tally[outcome.status] = (tally[outcome.status] || 0) + 1
    log(`${w.id} ${w.w}: ${outcome.status}${outcome.status === 'ok' ? '' : ' — ' + reasons(outcome).slice(0, 3).join('; ')} (${ms}ms)`)
  }
  return tally
}

export const retryOptFor = (store) => (w) => retryOptions(store.failed[w.id] || {})
