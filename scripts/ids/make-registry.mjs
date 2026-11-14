// ONE-TIME (2026-11-14, kept for audit): issued the stable word ids of data/ids.json from the positional ids
// `<level>-<idx>` the app used until then (docs/plan/08-word-data.md §7). It reads the frozen legacy files
// public/data/n{l}.json, whose row order IS the old idx, and the source CSVs for the exact headword/reading
// text; ids are issued level by level (N5, N4, N3, N2, N1), idx ascending, so `w000` = old `5-0`.
// It refuses to overwrite an existing registry: after this run ids are only ever added (build-data.mjs
// --assign-ids) or retired, never re-issued.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { formatRegistry, idOf, readSource, REGISTRY } from '../word-ids.mjs'

if (existsSync(REGISTRY)) {
  console.error(`${REGISTRY} exists: ids are never re-issued. Use node scripts/build-data.mjs --assign-ids for new words.`)
  process.exit(1)
}
const root = new URL('../..', import.meta.url).pathname
const ids = {}
let n = 0
for (const l of [5, 4, 3, 2, 1]) {
  const legacy = JSON.parse(readFileSync(`${root}public/data/n${l}.json`, 'utf8'))
  // the source rows of this level by headword+reading (deduplicated the way the positional build did)
  const src = new Map(readSource(l).map((x) => [`${x.w}\t${x.r}`, x]))
  if (src.size !== legacy.length) throw new Error(`N${l}: ${src.size} source words but ${legacy.length} legacy rows`)
  legacy.forEach(([w, r], idx) => {
    // the legacy rows store '' for a reading equal to the headword (and for the two source rows with none)
    const key = [`${w}\t${r || w}`, `${w}\t${r}`].find((k) => src.has(k))
    if (!key) throw new Error(`N${l} legacy row ${idx} ${w}|${r} not in the source`)
    const x = src.get(key)
    src.delete(key)
    ids[idOf(n++)] = { l, w: x.w, r: x.r, legacy: `${l}-${idx}` }
  })
}
writeFileSync(REGISTRY, formatRegistry({ next: n, ids }))
console.log(`${REGISTRY}: ${n} ids issued`)
