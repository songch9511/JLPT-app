// Times the reading-question generator: the one-off index build on the first card, then every reading-card
// word (k = S) once, as the study screen would. Not shipped.
//   node --experimental-strip-types scripts/distractor-bench.mjs [--gen path/to/distractors.ts]
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseRow } from '../src/data.ts'
// the study screen seeds a showing with the card's positional id of before stable ids (src/ids.ts)
import { legacySeed } from '../src/ids.ts'

const root = new URL('..', import.meta.url).pathname
const i = process.argv.indexOf('--gen')
const { readingQuestion } = await import(pathToFileURL(i > 0 ? process.argv[i + 1] : `${root}src/distractors.ts`).href)
const pool = []
for (const l of [5, 4, 3, 2, 1]) JSON.parse(readFileSync(`${root}public/data/words-n${l}.json`, 'utf8')).forEach((row, idx) => pool.push(parseRow(l, row, idx)))
const cards = pool.filter((w) => w.k === 'S')
let t = performance.now()
readingQuestion(cards[0], pool, 'first')
const first = performance.now() - t
for (const rep of [0, 1]) {
  const times = []
  for (const w of cards) {
    t = performance.now()
    readingQuestion(w, pool, `${legacySeed(w.id)}:r|${rep + 1}`)
    times.push([performance.now() - t, `${w.w} ${w.r}`])
  }
  if (rep === 0) continue // warm-up pass for the JIT
  times.sort((a, b) => a[0] - b[0])
  const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))][0].toFixed(2)
  console.log(`first card (index build included): ${first.toFixed(1)} ms`)
  console.log(`per card over ${times.length} words: median ${at(0.5)} ms, p99 ${at(0.99)} ms, max ${times.at(-1)[0].toFixed(2)} ms (${times.at(-1)[1]})`)
  console.log('slowest:', times.slice(-5).map(([ms, w]) => `${w} ${ms.toFixed(1)}`).join(' · '))
}
