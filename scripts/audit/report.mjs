// Combines the sample, the auditor's judgements and the mechanical checks into the audit outputs.
//   node scripts/audit/report.mjs   -> data/tags/audit/findings.json, data/tags/audit/review.csv, estimates on stdout
// Inputs: data/tags/audit/sample.json (sample.mjs), judgements.json (hand-written), mechanical.json (check-tags.mjs).
// Read-only on tag data. docs/plan/12-tag-audit.md explains the numbers.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadTagged, AUDIT_DIR } from './lib.mjs'

const read = (f) => JSON.parse(readFileSync(`${AUDIT_DIR}/${f}`, 'utf8'))
const sample = read('sample.json')
const judg = read('judgements.json')
const mech = read('mechanical.json')
const words = loadTagged()
const byId = new Map(words.map((w) => [w.id, w]))
const NS = words.filter((w) => w.k === 'S').length

const ERR_S = new Set(['toF', 'notS', 'sk'])
const LABEL = {
  toF: 'F여야 함(뜻이 다름)', notS: 'S 아님(한국어 단어가 드물거나 다른 말로 읽힘)', sk: 'sk 다리 단어 재검토', unsure: '확신 없음(원어민 확인)',
  notF: 'F 아님(J 권장)', ff: 'F 경고 문구·판정 재검토',
}

// ---------- S precision (stratified) ----------
const cellN = sample.cells
const units = sample.S.map(({ id, cell }) => {
  const j = judg[id]
  const v = j && j.src === 'sample' ? j.v : 'S'
  return { id, cell, level: Number(cell.split('/')[0]), shape: cell.split('/')[1], v, w: cellN[cell].N / cellN[cell].n }
})
function wilson(p, n, z = 1.96) {
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, c - h), Math.min(1, c + h)]
}
/** Weighted share of units passing `ok`, with a Wilson interval on Kish's effective sample size. */
function estimate(list, ok) {
  const W = list.reduce((a, u) => a + u.w, 0)
  const p = list.reduce((a, u) => a + (ok(u) ? u.w : 0), 0) / W
  const neff = W ** 2 / list.reduce((a, u) => a + u.w ** 2, 0)
  const [lo, hi] = wilson(p, neff)
  return { n: list.length, N: Math.round(W), neff: Math.round(neff), p, lo, hi, bad: list.filter((u) => !ok(u)).length }
}
const strict = (u) => u.v === 'S' // unsure counts as an error
const lenient = (u) => !ERR_S.has(u.v) // unsure counts as correct
const groups = {
  전체: units,
  ...Object.fromEntries([5, 4, 3, 2, 1].map((l) => [`N${l}`, units.filter((u) => u.level === l)])),
  ...Object.fromEntries([['1', '한 글자'], ['2', '두 글자'], ['3+', '세 글자 이상'], ['kana', '가나 포함']].map(([s, name]) => [name, units.filter((u) => u.shape === s)])),
}
const est = Object.fromEntries(Object.entries(groups).map(([g, l]) => [g, { lenient: estimate(l, lenient), strict: estimate(l, strict) }]))
const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log(`S precision (stratified, seed ${sample.seed}; lenient = 'unsure' counted correct, strict = counted wrong)`)
for (const [g, e] of Object.entries(est))
  console.log(`  ${g.padEnd(8)} n=${String(e.lenient.n).padStart(3)}/${String(e.lenient.N).padStart(4)}  lenient ${pct(e.lenient.p)} [${pct(e.lenient.lo)}–${pct(e.lenient.hi)}] (${e.lenient.bad} wrong)  strict ${pct(e.strict.p)} [${pct(e.strict.lo)}–${pct(e.strict.hi)}] (${e.strict.bad} wrong/unsure)`)
const all = est['전체']
const cards = (p) => Math.round(NS * (1 - p))
const misleading = { lenient: [cards(all.lenient.p), cards(all.lenient.hi), cards(all.lenient.lo)], strict: [cards(all.strict.p), cards(all.strict.hi), cards(all.strict.lo)] }
console.log(`  -> likely misleading reading cards among ${NS}: ${misleading.lenient[0]} (95% ${misleading.lenient[1]}–${misleading.lenient[2]}); counting unsure: ${misleading.strict[0]} (${misleading.strict[1]}–${misleading.strict[2]})`)

// ---------- F ----------
const fUnits = sample.F.map((id) => ({ id, v: judg[id]?.src === 'sample' ? judg[id].v : 'F' }))
const fCount = fUnits.reduce((m, u) => ((m[u.v] = (m[u.v] ?? 0) + 1), m), {})
console.log(`F: ${fUnits.length} judged (census) →`, fCount)

// ---------- findings + review list ----------
const W3 = { high: 3, med: 2, low: 1 }
const findings = Object.entries(judg).filter(([id]) => !id.startsWith('_')).map(([id, j]) => {
  const w = byId.get(id)
  return {
    id, level: w.level, chunk: w.chunk, word: w.core, expr: w.expr, reading: w.reading, k: w.k, sk: w.sk, ko: w.ko, en: w.en,
    src: j.src, verdict: j.v, finding: LABEL[j.v], conf: j.conf, harm: j.harm, suggest: j.sug, why: j.why,
    priority: W3[j.conf] * W3[j.harm] + (j.v === 'unsure' ? 0 : 0.5),
  }
}).sort((a, b) => b.priority - a.priority || b.level - a.level || a.id.localeCompare(b.id))

const sugText = (s) => (s ? [s.k, s.sk].filter(Boolean).join(' ') + (s.ff ? ` / ff: ${s.ff}` : '') : '')
const csvCell = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x))
const REVIEW_CAP = 40 // about an hour at ~1.5 minutes a row
const head = ['id', 'word', 'reading', 'level', 'current_k', 'sk', 'ko', 'finding', 'suggested', 'confidence', 'harm', 'reason', 'tag_file', 'decision']
const rows = findings.slice(0, REVIEW_CAP).map((f) => [f.id, f.word, f.reading, `N${f.level}`, f.k, f.sk, f.ko, f.finding, sugText(f.suggest), f.conf, f.harm, f.why, `data/tags/${f.chunk}.json`, ''])
writeFileSync(`${AUDIT_DIR}/review.csv`, '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n')

const out = {
  about: 'S/F tag audit, docs/plan/12-tag-audit.md. Regenerate: node scripts/audit/check-tags.mjs && node scripts/audit/report.mjs',
  sample: { seed: sample.seed, nS: units.length, nF: fUnits.length, cells: sample.cells },
  estimates: { S: est, misleadingReadingCards: misleading, totalS: NS, F: fCount },
  findings,
  sampleVerdicts: {
    S: units.map((u) => ({ id: u.id, cell: u.cell, word: byId.get(u.id).core, sk: byId.get(u.id).sk, verdict: u.v })),
    F: fUnits.map((u) => ({ id: u.id, word: byId.get(u.id).core, sk: byId.get(u.id).sk, verdict: u.v })),
  },
  mechanical: {
    file: 'data/tags/audit/mechanical.json',
    skUnexplained: mech.sk.count, skByClass: mech.sk.byClass, altReadings: mech.altReadings.count,
    shinjitaiHazardKanji: mech.shinjitai.hazards.length, shinjitaiByFlag: mech.shinjitai.byFlag,
    kanaOrKunS: mech.kanaOrKun.count, kanaOrKunByPattern: mech.kanaOrKun.byPattern,
    sameCoreDifferentTag: mech.sameCore.count, ffMisuse: mech.ff.count,
    koContainsSk: mech.koContainsSk.stats,
  },
}
writeFileSync(`${AUDIT_DIR}/findings.json`, JSON.stringify(out, null, 1) + '\n')
console.log(`findings: ${findings.length} (${findings.filter((f) => f.src === 'sample').length} from the sample) → review.csv ${rows.length} rows, findings.json`)
