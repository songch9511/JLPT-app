// Stratified random sample for the independent S/F judgement (docs/plan/12-tag-audit.md §3).
//   node scripts/audit/sample.mjs [--seed 20261114]   -> data/tags/audit/sample.json (deterministic for a seed)
//   node scripts/audit/sample.mjs --print S|F          print the sample as TSV for judging (no ff / rationale)
// Design: 600 S words. Level quota = max(80, proportional share); the rest goes to N3/N2/N1 in proportion.
// Inside a level, shapes (1 kanji / 2 kanji / 3+ kanji / with kana) get a proportional share with a floor of
// min(cell size, 8) so that small risky cells are seen. F: every F word if fewer than 400, else 300 at random.
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { loadTagged, shapeOf, mulberry32, shuffle, AUDIT_DIR } from './lib.mjs'

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d)
const SEED = Number(arg('--seed', 20261114))
const N_S = 600, LEVEL_FLOOR = 80, CELL_FLOOR = 8
const SHAPES = ['1', '2', '3+', 'kana']
const LEVELS = [5, 4, 3, 2, 1]

const words = loadTagged()
const byId = new Map(words.map((w) => [w.id, w]))

function design() {
  const S = words.filter((w) => w.k === 'S')
  const cells = {}
  for (const w of S) (cells[`${w.level}/${shapeOf(w.core)}`] ??= []).push(w.id)
  const levelN = Object.fromEntries(LEVELS.map((l) => [l, S.filter((w) => w.level === l).length]))
  const quota = {}
  let left = N_S, rest = 0
  for (const l of LEVELS) {
    const prop = (N_S * levelN[l]) / S.length
    if (prop < LEVEL_FLOOR) { quota[l] = Math.min(LEVEL_FLOOR, levelN[l]); left -= quota[l] } else rest += levelN[l]
  }
  const big = LEVELS.filter((l) => quota[l] === undefined)
  let given = 0
  big.forEach((l, i) => {
    quota[l] = i === big.length - 1 ? left - given : Math.round((left * levelN[l]) / rest)
    given += quota[l]
  })
  const rnd = mulberry32(SEED)
  const plan = {}, ids = []
  for (const l of LEVELS) {
    const sizes = Object.fromEntries(SHAPES.map((s) => [s, (cells[`${l}/${s}`] ?? []).length]))
    const n = {}
    let used = 0
    for (const s of SHAPES) if (s !== '2') { n[s] = Math.min(sizes[s], Math.max(CELL_FLOOR, Math.round((quota[l] * sizes[s]) / levelN[l]))); used += n[s] }
    n['2'] = Math.min(sizes['2'], quota[l] - used)
    for (const s of SHAPES) {
      const key = `${l}/${s}`
      const pool = (cells[key] ?? []).slice().sort()
      const pick = shuffle(pool, rnd).slice(0, n[s])
      plan[key] = { N: pool.length, n: pick.length }
      ids.push(...pick.map((id) => ({ id, cell: key })))
    }
  }
  const F = words.filter((w) => w.k === 'F').map((w) => w.id).sort()
  const fPick = F.length < 400 ? F : shuffle(F, rnd).slice(0, 300)
  return { seed: SEED, rng: 'mulberry32, ids sorted then Fisher–Yates per cell in level order 5→1, shapes 1/2/3+/kana', nS: ids.length, cells: plan, S: ids, F: fPick }
}

const print = arg('--print', null)
if (print) {
  const s = JSON.parse(readFileSync(`${AUDIT_DIR}/sample.json`, 'utf8'))
  const list = print === 'F' ? s.F.map((id) => ({ id, cell: 'F' })) : s.S
  for (const { id, cell } of list) {
    const w = byId.get(id)
    console.log([id, cell, w.core, w.reading, w.sk, w.ko, w.en].join('\t'))
  }
} else {
  const d = design()
  if (existsSync(`${AUDIT_DIR}/sample.json`)) {
    const old = JSON.parse(readFileSync(`${AUDIT_DIR}/sample.json`, 'utf8'))
    if (old.seed === d.seed && JSON.stringify(old.S) !== JSON.stringify(d.S)) console.log('note: the word list changed since the sample was drawn; judgements for words not in the new sample are kept but unused')
  }
  writeFileSync(`${AUDIT_DIR}/sample.json`, JSON.stringify(d, null, 1) + '\n')
  console.log(`seed ${d.seed}: ${d.nS} S words, ${d.F.length} F words -> ${AUDIT_DIR}/sample.json`)
  for (const [k, v] of Object.entries(d.cells)) if (v.N) console.log(`  N${k.replace('/', ' ')}: ${v.n}/${v.N}`)
}
