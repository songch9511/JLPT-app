// Converts a filled-in chunk TSV (answer columns k, sk, ff, rt) into data/tags/n<level>-<part>.json,
// then validates it.
//   node scripts/enrich/tags-import.mjs path/to/n5-2.tsv [more.tsv ...]
// The output name comes from the TSV file name, so keep it (n5-2.tsv -> data/tags/n5-2.json).
// Empty cells are dropped; existing JSON files are overwritten.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { root } from './words.mjs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node scripts/enrich/tags-import.mjs <filled chunk .tsv> ...')
  process.exit(2)
}
const outs = []
for (const f of files) {
  const name = basename(f).replace(/\.tsv$/, '')
  if (!/^n[1-5]-\d+$/.test(name)) {
    console.error(`${f}: file name must stay n<level>-<part>.tsv`)
    process.exit(2)
  }
  const [head, ...lines] = readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const cols = head.split('\t')
  const at = (c) => cols.indexOf(c)
  for (const c of ['id', 'k', 'sk', 'ff', 'rt']) if (at(c) < 0) { console.error(`${f}: column "${c}" missing (chunks made before stable word ids have "idx": make them again with tag-chunks.mjs)`); process.exit(2) }
  const out = {}
  for (const line of lines) {
    const v = line.split('\t')
    const t = {}
    for (const c of ['k', 'sk', 'ff', 'rt']) {
      const x = (v[at(c)] ?? '').trim()
      if (x) t[c] = c === 'k' ? x.toUpperCase() : x
    }
    out[v[at('id')].trim()] = t
  }
  const path = `${root}data/tags/${name}.json`
  writeFileSync(path, '{\n' + Object.entries(out).map(([k, t]) => `${JSON.stringify(k)}:${JSON.stringify(t)}`).join(',\n') + '\n}\n')
  console.log(`${f} -> ${path} (${Object.keys(out).length} words)`)
  outs.push(path)
}
const r = spawnSync(process.execPath, [new URL('./validate-tags.mjs', import.meta.url).pathname, ...outs], { stdio: 'inherit' })
process.exit(r.status ?? 1)
