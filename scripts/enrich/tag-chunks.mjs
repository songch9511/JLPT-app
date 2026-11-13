// Labelling chunks for the word-type tags.
//   node scripts/enrich/tag-chunks.mjs <outDir> [level ...]
// Chunk membership is fixed in data/tags/chunks.json (created on the first run, reused afterwards, so a later
// change of the frequency order never moves a word between chunks that are already being labelled).
// Words are chunked in introduction order (data/freq/order-n{l}.json): part 1 holds the words users meet first.
// N5 part 1 is a 60-word pilot chunk; every other chunk is ~250 words.
//
// Writes <outDir>/n<level>-<part>.tsv with a header row. Columns:
//   idx expr reading ko en | auto hint sk_candidates rt_candidate | k sk ff rt   (last four = answers;
//   k is prefilled for L/K, sk with the first candidate when the hint is S or J, rt with the candidate)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { levelWords, root, LEVELS } from './words.mjs'
import { prepassLevel, loadKanjiTable } from './prepass.mjs'

export const MANIFEST = `${root}data/tags/chunks.json`
const SIZE = 250
const PILOT = { 5: 60 }

function buildManifest() {
  const m = {}
  for (const n of LEVELS) {
    const order = JSON.parse(readFileSync(`${root}data/freq/order-n${n}.json`, 'utf8'))
    let rest = order
    let p = 1
    if (PILOT[n]) {
      m[`n${n}-${p++}`] = rest.slice(0, PILOT[n])
      rest = rest.slice(PILOT[n])
    }
    const parts = Math.max(1, Math.round(rest.length / SIZE))
    for (let i = 0; i < parts; i++)
      m[`n${n}-${p++}`] = rest.slice(Math.round((i * rest.length) / parts), Math.round(((i + 1) * rest.length) / parts))
  }
  return m
}

export function loadManifest({ create = false } = {}) {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  if (!create) throw new Error(`${MANIFEST} missing: run node scripts/enrich/tag-chunks.mjs <outDir> first`)
  const m = buildManifest()
  writeFileSync(MANIFEST, '{\n' + Object.entries(m).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}\n')
  return m
}

export const HEADER = ['idx', 'expr', 'reading', 'ko', 'en', 'auto', 'hint', 'sk_candidates', 'rt_candidate', 'k', 'sk', 'ff', 'rt']
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/&nbsp;/g, ' ')

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [, , outDir, ...lv] = process.argv
  if (!outDir) {
    console.error('usage: node scripts/enrich/tag-chunks.mjs <outDir> [level ...]')
    process.exit(2)
  }
  const levels = lv.length ? lv.map(Number) : LEVELS
  const manifest = loadManifest({ create: true })
  const table = loadKanjiTable()
  mkdirSync(outDir, { recursive: true })
  for (const n of levels) {
    const ws = levelWords(n)
    const pre = prepassLevel(n, table)
    const parts = Object.entries(manifest).filter(([name]) => name.startsWith(`n${n}-`))
    for (const [name, idxs] of parts) {
      const rows = idxs.map((i) => {
        const w = ws[i], p = pre[i]
        const sk = ['S', 'J'].includes(p.hint) ? p.sk[0] ?? '' : ''
        return [i, w.expr, w.reading === w.expr ? '' : w.reading, w.ko, w.en, p.auto, p.hint, p.sk.join(' '), p.rt,
          p.auto, sk, '', p.rt].map(clean).join('\t')
      })
      writeFileSync(`${outDir}/${name}.tsv`, [HEADER.join('\t'), ...rows].join('\n') + '\n')
    }
    console.log(`N${n}: ${parts.length} chunks (${parts.map(([, v]) => v.length).join(', ')} words)`)
  }
}
