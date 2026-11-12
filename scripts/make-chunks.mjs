// Writes TSV chunks (idx, expression, reading, english) for translation into Korean.
import { writeFileSync, mkdirSync } from 'node:fs'
import { loadLevel } from './build-data.mjs'
const [, , level, size = '350', outDir = 'data/chunks'] = process.argv
mkdirSync(outDir, { recursive: true })
const words = loadLevel(Number(level))
for (let s = 0, p = 1; s < words.length; s += Number(size), p++) {
  const lines = words.slice(s, s + Number(size)).map((w, i) => [s + i, ...w].join('\t'))
  writeFileSync(`${outDir}/n${level}-${p}.tsv`, lines.join('\n') + '\n')
  console.log(`${outDir}/n${level}-${p}.tsv ${lines.length}`)
}
