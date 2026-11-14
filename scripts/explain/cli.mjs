#!/usr/bin/env node
// Word-explanation pipeline. See docs/plan/09-explanations.md for the full procedure.
//
//   node cli.mjs run --dry-run [--levels n5,n4] [--limit N] [--ids w001,w0k3]   build requests, print estimate, send nothing
//   node cli.mjs count-tokens [--n 20]            measure input tokens with the count_tokens endpoint (no generation)
//   node cli.mjs run --sample 200                 send 200 stratified words synchronously, then review them
//   node cli.mjs run [--levels …] [--no-wait]     submit the rest as batches, wait, collect (resumes open batches first)
//   node cli.mjs status [--remote]                local state (and, with --remote, recent batches on the account)
//   node cli.mjs retry [--sync] [--dry-run]       re-send only failed ids (refusal → fallback model, max_tokens → 2×)
//   node cli.mjs validate [--stale-prompt]        re-check accepted outputs against current words/tags (and prompt version)
//   node cli.mjs review [--levels …] [--per-cell 5 | --share 0.05 | --all]
//   node cli.mjs export                           data/explain/dist/<level>/<shard>.json + manifest.json
//   node cli.mjs regen --ids w00c                 regenerate single words now (synchronous)
//   node cli.mjs adopt <batch_id> | --none        resolve an interrupted submission

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG, LEVELS, PRICES, REPO_ROOT } from './lib/config.mjs'
import { heuristicTokens, profile, scenarios } from './lib/cost.mjs'
import { exportAll } from './lib/export.mjs'
import { SYSTEM, userMessage } from './lib/prompt.mjs'
import { buildParams, buildRequest } from './lib/requests.mjs'
import { revalidate } from './lib/revalidate.mjs'
import { pickRows, rowFor, toHtml, toTsv } from './lib/review.mjs'
import { pending, resume, retryOptFor, retryable, runSync, submit } from './lib/runner.mjs'
import { OUTPUT_SCHEMA } from './lib/schema.mjs'
import { Store } from './lib/store.mjs'
import { loadWords, select, stratified } from './lib/words.mjs'

export function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!t.startsWith('--')) { a._.push(t); continue }
    const [k, v] = t.slice(2).split('=')
    const next = argv[i + 1]
    if (v !== undefined) a[k] = v
    else if (next !== undefined && !next.startsWith('--') && ['levels', 'limit', 'ids', 'sample', 'n', 'per-cell', 'share', 'name'].includes(k)) (a[k] = next), i++
    else a[k] = true
  }
  if (a.levels) {
    a.levels = String(a.levels).split(',').map((s) => s.trim().toLowerCase())
    const bad = a.levels.filter((l) => !LEVELS.includes(l))
    if (bad.length) throw new Error(`알 수 없는 급수: ${bad.join(',')}`)
  }
  if (a.ids) a.ids = String(a.ids).split(',').map((s) => s.trim()).filter(Boolean)
  for (const k of ['limit', 'sample', 'n', 'per-cell', 'share']) if (a[k] !== undefined) a[k] = Number(a[k])
  return a
}

async function realClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY가 없습니다. 전용 워크스페이스에서 만든 키를 환경 변수로 넣고 다시 실행하세요 (docs/plan/09-explanations.md §7).')
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({ maxRetries: 4 })
}

function fmtUsd(x) { return `$${x.toFixed(2)}` }

function estimate(words, store, root, log) {
  const tokenCountFile = new Store(root).p.tokenCount
  const tokenCount = fs.existsSync(tokenCountFile) ? JSON.parse(fs.readFileSync(tokenCountFile, 'utf8')) : null
  const heuristic = {
    prefix: heuristicTokens(SYSTEM) + heuristicTokens(JSON.stringify(OUTPUT_SCHEMA)),
    user: words.length ? words.reduce((s, w) => s + heuristicTokens(userMessage(w)), 0) / words.length : 0,
  }
  const prof = profile({ usage: store.usage, tokenCount, heuristic })
  log(`\n요청 ${words.length}건 · 모델 ${CONFIG.model} · 가격 ${PRICES.source} (${PRICES.checked} 확인), 배치 50% 할인 · 재시도 5% 가정`)
  log(`요청당 토큰: 공유 접두부 ${Math.round(prof.prefix)} [${prof.source.prefix}] · 단어별 입력 ${Math.round(prof.user)} [${prof.source.user}] · 출력 ${Math.round(prof.output)} [${prof.source.output}]` +
    (prof.thinking != null ? ` (그중 사고 ${Math.round(prof.thinking)})` : ''))
  for (const r of scenarios(prof, words.length, CONFIG.model, { ttl: CONFIG.cacheTtl === '5m' ? '5m' : '1h' })) {
    log(`  ${r.label.padEnd(28)} ${fmtUsd(r.usd).padStart(9)}  (출력 ${fmtUsd(r.parts.output)}, 입력 ${fmtUsd(r.parts.input)}, 캐시쓰기 ${fmtUsd(r.parts.cacheWrite)}, 캐시읽기 ${fmtUsd(r.parts.cacheRead)})`)
  }
  const batches = Math.ceil(words.length / CONFIG.batchChunk)
  log(`시간: 배치 ${batches}개 동시 제출. 공식 문서 기준 대부분 1시간 안, 최대 24시간(넘으면 expired → retry).` +
    (prof.latencyMs ? ` 동기(샘플) 1건 평균 ${(prof.latencyMs / 1000).toFixed(1)}초 [measured].` : ' 동기 1건 지연은 아직 미측정(--sample 후 표시).'))
  return prof
}

export async function main(argv, env = {}) {
  const log = env.log || console.log
  const root = env.root || REPO_ROOT
  const a = parseArgs(argv)
  const cmd = a._[0] || 'help'
  const getClient = async () => env.client || (await realClient())
  const store = new Store(root)
  const all = loadWords({ root, warn: (m) => log(`경고: ${m}`) })
  const byId = new Map(all.map((w) => [w.id, w]))
  const levelWords = a.levels ? all.filter((w) => a.levels.includes(w.level)) : all
  const chosen = select(levelWords, { ids: a.ids, limit: a.limit })
  const waitOpt = { wait: !a['no-wait'], sleep: env.sleep, log }

  switch (cmd) {
    case 'run': {
      if (a['dry-run']) {
        const todo = pending(store, chosen)
        const reqs = todo.map((w) => buildRequest(w))
        fs.mkdirSync(path.dirname(store.p.preview), { recursive: true })
        fs.writeFileSync(store.p.preview, reqs.slice(0, 5).map((r) => JSON.stringify(r)).join('\n') + (reqs.length ? '\n' : ''))
        const bytes = reqs.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r)), 0)
        log(`dry-run: 아무것도 보내지 않았습니다. 새로 만들 요청 ${reqs.length}건 (이미 완료 ${Object.keys(store.accepted).length}, 재시도 목록 ${Object.keys(store.failed).length}), ` +
          `요청 본문 합계 ${(bytes / 1e6).toFixed(1)}MB (배치당 한도 256MB, ${CONFIG.batchChunk}건씩 나눔). 앞 5건: ${path.relative(root, store.p.preview)}`)
        estimate(todo, store, root, log)
        return { requests: reqs.length }
      }
      const client = await getClient()
      if (a.sample) {
        const words = stratified(pending(store, chosen), a.sample, 'sample')
        log(`샘플 ${words.length}건을 동기 호출로 보냅니다 (배치와 같은 파라미터, 표준 가격).`)
        const tally = await runSync(client, store, words, { log })
        writeReview(store, all, words.map((w) => w.id), 'sample', root, log)
        log(`샘플 결과: ${JSON.stringify(tally)}`)
        estimate(pending(store, all), store, root, log)
        return tally
      }
      if (a.sync) return runSync(client, store, pending(store, chosen), { log })
      const done = await resume(client, store, byId, waitOpt)
      if (!done) { log('열린 배치가 아직 처리 중입니다. 나중에 다시 `run`을 실행하면 이어서 수집합니다.'); return { open: store.openBatches().length } }
      const todo = pending(store, chosen)
      if (!todo.length) { log('새로 보낼 단어가 없습니다.'); return { submitted: 0 } }
      await submit(client, store, todo, { log })
      await resume(client, store, byId, waitOpt)
      summary(store, all, log)
      return { submitted: todo.length }
    }
    case 'retry': {
      let todo = retryable(store, chosen)
      const optFor = retryOptFor(store)
      if (a['dry-run']) {
        for (const w of todo) log(`${w.id} ${w.w}: ${store.failed[w.id].reasons.join('; ')} → ${JSON.stringify(optFor(w))}`)
        log(`재시도 대상 ${todo.length}건 (시도 ${CONFIG.maxAttempts}회 넘은 것·재시도 불가 오류 제외)`)
        return { retry: todo.length }
      }
      const client = await getClient()
      if (!(await resume(client, store, byId, waitOpt))) { log('열린 배치가 아직 처리 중입니다.'); return { open: true } }
      todo = retryable(store, chosen) // collecting open batches may have changed the list
      if (!todo.length) { log('재시도할 단어가 없습니다.'); return { retry: 0 } }
      if (a.sync) await runSync(client, store, todo, { optFor, log })
      else {
        await submit(client, store, todo, { optFor, purpose: 'retry', log })
        await resume(client, store, byId, waitOpt)
      }
      summary(store, all, log)
      return { retry: todo.length }
    }
    case 'regen': {
      if (!a.ids?.length) throw new Error('regen에는 --ids가 필요합니다')
      for (const id of a.ids) delete store.accepted[id], delete store.failed[id]
      store.saveAll()
      return runSync(await getClient(), store, chosen, { log })
    }
    case 'count-tokens': {
      const client = await getClient()
      const n = a.n || 20
      const words = stratified(chosen, n, 'count')
      const base = buildParams(words[0])
      const strip = (p) => ({ model: p.model, system: p.system, messages: p.messages, output_config: p.output_config })
      const prefix = (await client.messages.countTokens({ ...strip(base), messages: [{ role: 'user', content: '.' }] })).input_tokens
      const totals = []
      for (const w of words) totals.push((await client.messages.countTokens(strip(buildParams(w)))).input_tokens)
      const res = { model: CONFIG.model, at: new Date().toISOString(), n: totals.length, prefix, meanTotal: totals.reduce((s, x) => s + x, 0) / totals.length, totals }
      fs.mkdirSync(path.dirname(store.p.tokenCount), { recursive: true })
      fs.writeFileSync(store.p.tokenCount, JSON.stringify(res, null, 1) + '\n')
      log(`count_tokens: 접두부(시스템+스키마, 사용자 '.') ${prefix}, 단어 ${totals.length}개 평균 전체 입력 ${res.meanTotal.toFixed(0)}`)
      estimate(pending(store, all), store, root, log)
      return res
    }
    case 'status': {
      summary(store, all, log)
      for (const b of store.state.batches) log(`  ${b.id} ${b.purpose} ${b.ids.length}건 ${b.collectedAt ? '수집됨 ' + b.collectedAt : b.status}`)
      if (store.state.pendingSubmit) log(`  주의: 제출 중단 표시 있음 (${store.state.pendingSubmit.startedAt}) → adopt`)
      if (a.remote) {
        const client = await getClient()
        const page = await client.messages.batches.list({ limit: 20 })
        for (const b of page.data || []) log(`  [원격] ${b.id} ${b.processing_status} ${b.created_at} ${JSON.stringify(b.request_counts)}`)
      }
      return store.state
    }
    case 'adopt': {
      const p = store.state.pendingSubmit
      if (!p) { log('제출 중단 표시가 없습니다.'); return null }
      if (a.none) store.state.pendingSubmit = null
      else {
        const id = a._[1]
        if (!id) throw new Error('adopt <batch_id> 또는 adopt --none')
        store.state.batches.push({ id, purpose: p.purpose, submittedAt: p.startedAt, model: CONFIG.model, maxTokens: CONFIG.maxTokens, ids: p.ids, overrides: {}, status: 'in_progress', collectedAt: null })
        for (const i of p.ids) store.bumpAttempt(i)
        store.state.pendingSubmit = null
      }
      store.saveState()
      log('정리했습니다. 이제 `run`으로 이어서 진행하세요.')
      return store.state
    }
    case 'validate': {
      const { ok, failures } = revalidate(store.accepted, byId, { stalePrompt: !!a['stale-prompt'] })
      for (const [id, f] of failures) {
        store.failed[id] = {
          status: f.status, reasons: f.errors.map((e) => `${e.code}@${e.field}${e.msg ? ` (${e.msg})` : ''}`), retryable: true,
          attempts: store.attempts(id), model: store.accepted[id]?.meta?.model, maxTokens: CONFIG.maxTokens, at: new Date().toISOString(),
          output: store.accepted[id]?.output,
        }
        // a word moved back to the retry list gets a fresh attempt budget
        store.state.attempts[id] = 0
      }
      store.accepted = ok
      store.saveAll()
      const codes = {}
      for (const f of failures.values()) for (const e of f.errors) codes[e.code] = (codes[e.code] || 0) + 1
      log(`검증: 통과 ${Object.keys(ok).length}, 재시도 목록으로 이동 ${failures.size} ${JSON.stringify(codes)}`)
      summary(store, all, log)
      return { ok: Object.keys(ok).length, failed: failures.size, codes }
    }
    case 'review': {
      const words = a.ids ? chosen : levelWords
      const rows = pickRows(words, store.accepted, { perCell: a['per-cell'] || 5, share: a.share ?? null, all: !!a.all })
      const name = a.name || (a.all ? `all-${(a.levels || ['all']).join('-')}` : `sample-${(a.levels || ['all']).join('-')}`)
      return writeReview(store, all, rows, name, root, log)
    }
    case 'export': {
      const { ok, failures } = revalidate(store.accepted, byId)
      if (failures.size) log(`경고: 검증에 실패한 ${failures.size}건은 내보내지 않습니다 (validate → retry로 처리).`)
      const m = exportAll(all, ok, store.p.dist)
      log(`내보냄: ${m.totals.exported}/${m.totals.words}단어, 파일 ${m.shards.length}개, ${(m.totals.bytes / 1e6).toFixed(2)}MB (gzip ${(m.totals.gzipBytes / 1e6).toFixed(2)}MB) → ${path.relative(root, store.p.dist)}`)
      return m
    }
    default:
      log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
      return null
  }
}

function writeReview(store, all, rowsOrIds, name, root, log) {
  const byId = new Map(all.map((w) => [w.id, w]))
  const rows = (typeof rowsOrIds[0] === 'string' ? rowsOrIds.map((id) => ({ w: byId.get(id), why: 'sample' })) : rowsOrIds)
    .filter(({ w }) => store.accepted[w.id] || store.failed[w.id]?.output)
    .map(({ w, why }) => {
      const item = store.accepted[w.id] || { output: store.failed[w.id].output, warnings: [{ code: 'FAILED:' + store.failed[w.id].reasons.join(' '), field: '' }] }
      return { why: store.accepted[w.id] ? why : 'failed', row: rowFor(w, item) }
    })
  fs.mkdirSync(store.p.review, { recursive: true })
  const tsv = path.join(store.p.review, `${name}.tsv`)
  const html = path.join(store.p.review, `${name}.html`)
  fs.writeFileSync(tsv, toTsv(rows))
  fs.writeFileSync(html, toHtml(rows, `단어 설명 검수: ${name}`))
  log(`검수표 ${rows.length}행 → ${path.relative(root, tsv)}, ${path.relative(root, html)}`)
  return { rows: rows.length, tsv, html }
}

function summary(store, all, log) {
  const by = {}
  for (const w of all) {
    const s = (by[w.level] ||= { total: 0, ok: 0, failed: 0 })
    s.total++
    if (store.accepted[w.id]) s.ok++
    else if (store.failed[w.id]) s.failed++
  }
  log('현황: ' + Object.entries(by).map(([l, s]) => `${l} ${s.ok}/${s.total} (실패 ${s.failed})`).join(' · ') + ` · 열린 배치 ${store.openBatches().length}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message || e)
    process.exit(1)
  })
}
