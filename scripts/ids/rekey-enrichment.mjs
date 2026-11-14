// ONE-TIME (2026-11-14, kept for audit): re-keyed the enrichment inputs from the positional word index of a level
// (`"<idx>"`, i.e. legacy id `<level>-<idx>`) to the stable word id (`"w0k3"`), using the `legacy` field of
// data/ids.json. Values and the order of entries are unchanged; only keys (and the idx lists of chunks.json and
// order-n{l}.json) are rewritten. It refuses to touch a file that is not keyed by idx any more, so running it
// twice changes nothing.
//   node scripts/ids/rekey-enrichment.mjs [repo root]   (default: this repository; the explain tests' fixture
//   repository is converted with its own root)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadRegistry } from '../word-ids.mjs'

const root = (process.argv[2] ?? new URL('../..', import.meta.url).pathname).replace(/\/?$/, '/')
const reg = loadRegistry()
const byLegacy = new Map(Object.entries(reg.ids).filter(([, e]) => e.legacy).map(([id, e]) => [e.legacy, id]))
const idFor = (l, idx) => {
  const id = byLegacy.get(`${l}-${idx}`)
  if (!id) throw new Error(`no id for legacy ${l}-${idx}`)
  return id
}
const isIdx = (k) => /^(0|[1-9]\d*)$/.test(String(k))

/** Same layout as before: one entry per line when the file had that, else compact. */
function write(path, obj, lineStyle) {
  const text = lineStyle
    ? '{\n' + Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}\n'
    : JSON.stringify(obj) + '\n'
  writeFileSync(path, text)
}

let files = 0
/** A `{ "<idx>": value }` file of level l. */
function rekeyObject(path, l) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const obj = JSON.parse(text)
  const keys = Object.keys(obj)
  if (!keys.length || !keys.every(isIdx)) return console.log(`skip ${path} (not keyed by idx)`)
  const out = {}
  for (const k of keys) out[idFor(l, k)] = obj[k]
  write(path, out, text.startsWith('{\n'))
  files++
}

const levelOfName = (f) => Number(/^n([1-5])/.exec(f)?.[1])
const dirFiles = (d, re) => (existsSync(`${root}${d}`) ? readdirSync(`${root}${d}`).filter((f) => re.test(f)) : [])

for (const f of dirFiles('data/ko', /^n[1-5]-\d+\.json$/)) rekeyObject(`${root}data/ko/${f}`, levelOfName(f))
for (const f of dirFiles('data/tags', /^n[1-5]-\d+\.json$/)) rekeyObject(`${root}data/tags/${f}`, levelOfName(f))
for (const f of dirFiles('data/tags/prepass', /^n[1-5]\.json$/)) rekeyObject(`${root}data/tags/prepass/${f}`, levelOfName(f))
for (const f of dirFiles('data/freq', /^n[1-5](\.src)?\.json$/)) rekeyObject(`${root}data/freq/${f}`, levelOfName(f))
for (const f of dirFiles('data/readings', /^n[1-5]\.json$/)) rekeyObject(`${root}data/readings/${f}`, levelOfName(f))

for (const f of dirFiles('data/freq', /^order-n[1-5]\.json$/)) {
  const path = `${root}data/freq/${f}`
  const order = JSON.parse(readFileSync(path, 'utf8'))
  if (!order.every(isIdx)) { console.log(`skip ${path}`); continue }
  const l = Number(/n([1-5])/.exec(f)[1])
  writeFileSync(path, JSON.stringify(order.map((i) => idFor(l, i))).replace(/","/g, '", "') + '\n')
  files++
}

const chunks = `${root}data/tags/chunks.json`
if (existsSync(chunks)) {
  const m = JSON.parse(readFileSync(chunks, 'utf8'))
  if (Object.values(m).every((v) => v.every(isIdx))) {
    for (const k of Object.keys(m)) m[k] = m[k].map((i) => idFor(levelOfName(k), i))
    write(chunks, m, true)
    files++
  }
}

// reviewed warnings: "<chunk>:<idx>" -> "<id>" (an id names one word in one chunk)
const reviewed = `${root}data/tags/reviewed.json`
if (existsSync(reviewed)) {
  const m = JSON.parse(readFileSync(reviewed, 'utf8'))
  if (Object.keys(m).every((k) => /^n[1-5]-\d+:\d+$/.test(k))) {
    const out = {}
    for (const [k, v] of Object.entries(m)) {
      const [chunk, idx] = k.split(':')
      out[idFor(levelOfName(chunk), idx)] = v
    }
    write(reviewed, out, true)
    files++
  }
}
console.log(`${files} files re-keyed under ${root}`)
