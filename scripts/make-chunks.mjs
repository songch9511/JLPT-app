// Writes TSV chunks (id, expression, reading, english) for translation into Korean. The answers go into
// data/ko/n<level>-<part>.json as { "<word id>": "뜻" } (stable word ids, docs/plan/08 §7).
import { writeFileSync, mkdirSync } from 'node:fs'
import { loadLevel } from './build-data.mjs'
const [, , level, size = '350', outDir = 'data/chunks'] = process.argv
mkdirSync(outDir, { recursive: true })
const words = loadLevel(Number(level))
for (let s = 0, p = 1; s < words.length; s += Number(size), p++) {
  const lines = words.slice(s, s + Number(size)).map((w) => [w.id, w.w, w.r, w.en].join('\t'))
  writeFileSync(`${outDir}/n${level}-${p}.tsv`, lines.join('\n') + '\n')
  console.log(`${outDir}/n${level}-${p}.tsv ${lines.length}`)
}
