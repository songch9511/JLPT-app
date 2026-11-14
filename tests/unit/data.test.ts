// The shipped word data and the stable word ids (docs/plan/08-word-data.md §7).
// - data/ids.json pins every word's id; the ids of all 8,130 words are fixed by a hash of the registry.
// - public/data/words-n{l}.json (what this version reads) carries the id in each row; apart from it, every row is
//   what the version before stable ids shipped, column for column.
// - public/data/n{l}.json (what that version reads, for tabs still running it) are frozen byte for byte.
// - Changing the source (re-ordering, adding, removing, correcting rows) never changes a surviving word's id.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS build helpers
import * as ids from '../../scripts/word-ids.mjs'
// @ts-expect-error plain JS build helpers
import { applyCorrections, idModule, loadInputs, loadWords } from '../../scripts/build-data.mjs'

const LEVELS = [5, 4, 3, 2, 1] as const
const COUNTS: Record<number, number> = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2699 }
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const legacyRows = (l: number) => JSON.parse(read(`public/data/n${l}.json`)) as unknown[][]
const rows = (l: number) => JSON.parse(read(`public/data/words-n${l}.json`)) as unknown[][]

type Entry = { l: number; w: string; r: string; legacy?: string; retired?: string }
type Registry = { format: 1; next: number; ids: Record<string, Entry> }
const registry = (): Registry => JSON.parse(read('data/ids.json'))
const sources = () => Object.fromEntries(LEVELS.map((l) => [l, ids.readSource(l)])) as Record<number, { w: string; r: string; en: string }[]>

/** sha256 of each frozen positional file, as the last version before stable ids (commit 5fd69b4) shipped it. */
const FROZEN: Record<number, string> = {
  1: '8df76d4fe71ab622d7513c944af305c06461518531d0224c5a6f408c10e1e2e4',
  2: '5b5c9c1e8b6f47ce0a5f0699a660c9bdccfdb267e342890e93a6585ae9250b4b',
  3: '180e71ce6cc4cbff524c8fa6614665357cc3a2375c6c348c330872baefd2c27c',
  4: '8c13aa740da970bed83e62c1c157273d374baad79f8d5b03096b6bd3159e7a21',
  5: 'e9fc3dac62621dd762b938554ade5d41fca9927cf05fcec796df849d4af6e4fd',
}
/**
 * sha256 over every registry entry (id, level, headword, reading, positional id, tombstone) in file order. It may
 * only change together with an intended registry edit (new ids, a correction, a retirement) — and the tests below
 * then still prove no existing id moved to another word.
 * 2026-11-14: w4db's headword corrected 副 → とりわけ (source error, docs/plan/12 §6, 08 §7.2).
 */
const REGISTRY_SHA = '05a8110fa2478fb63957ceb51dec2fc784dff555ada6bf54fde17e19ce95de88'

/**
 * Source errors corrected after the positional files froze (docs/plan/12 §6, 08 §7.2), by id: each column that may
 * now differ from the frozen file, with the value the frozen file has and the value shipped now. Headword/reading
 * fixes are registry edits (the id stays); `en` comes from data/corrections.json; `f` is re-measured for the new
 * headword (the introduction order `o` is pinned by data/freq/order-pins.json, so no other word's place moves).
 * Columns are those of the frozen row [w, r, ko, en, o, f, …tags]; tags are covered by TAGS_CORRECTED.
 */
const SOURCE_CORRECTED: Record<string, { level: number; cols: Record<number, [unknown, unknown]> }> = {
  // 副 とりわけ → とりわけ (kana headword, reading column '' as for every kana word), f 46 (副's) → 42
  w4db: { level: 1, cols: { 0: ['副', 'とりわけ'], 1: ['とりわけ', ''], 5: [46, 42] } },
  // 目下 めした had もっか's gloss
  w41j: { level: 2, cols: { 3: ['at present, now', 'subordinate, junior, inferior'] } },
}

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffle = <T,>(xs: T[], rnd: () => number) => {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
/** id of every source word in a resolution, keyed by level + headword + reading */
const idsByWord = (levels: Record<number, { id: string; w: string; r: string }[]>) => {
  const m = new Map<string, string>()
  for (const l of LEVELS) for (const x of levels[l] ?? []) m.set(`${l}\t${x.w}\t${x.r}`, x.id)
  return m
}

describe('the id registry (data/ids.json)', () => {
  it('pins the ids of all 8,130 words', () => {
    const reg = registry()
    const lines = Object.entries(reg.ids).map(([id, e]) => [id, e.l, e.w, e.r, e.legacy ?? '', e.retired ?? ''].join('\t'))
    expect(lines).toHaveLength(8130)
    expect(reg.next).toBe(8130)
    expect(createHash('sha256').update(lines.join('\n')).digest('hex')).toBe(REGISTRY_SHA)
    // every id is well formed, issued below `next`, and the app's id pattern agrees with the build's
    const appPattern = /^w(?:[0-9a-z]{3}|[1-9a-z][0-9a-z]{3,})$/
    for (const id of Object.keys(reg.ids)) {
      expect(ids.counterOf(id)).toBeGreaterThanOrEqual(0)
      expect(ids.counterOf(id)).toBeLessThan(reg.next)
      expect(id).toMatch(appPattern)
    }
  })

  it('every positional id of the version before stable ids names the same word under its stable id', () => {
    const reg = registry()
    const byLegacy = new Map(Object.entries(reg.ids).map(([id, e]) => [e.legacy, { id, ...e }]))
    for (const l of LEVELS) {
      const old = legacyRows(l)
      expect(old).toHaveLength(COUNTS[l])
      old.forEach(([w, r], idx) => {
        const e = byLegacy.get(`${l}-${idx}`)!
        expect(e, `${l}-${idx}`).toBeDefined()
        expect(e.l).toBe(l)
        const fix = SOURCE_CORRECTED[e.id]?.cols[0]
        // a corrected headword: the frozen file has the old one, the registry the new one (same id)
        if (fix) expect([w, e.w]).toEqual(fix)
        else expect(e.w).toBe(w)
        // the positional files wrote '' for a reading equal to the headword
        expect(r === '' ? [e.w, ''] : [r]).toContain(e.r)
      })
    }
  })

  it('the same headword and reading in two levels are two words with two ids; a repeat within a level is merged', () => {
    const reg = registry()
    const byKey = new Map<string, string[]>()
    for (const [id, e] of Object.entries(reg.ids)) byKey.set(`${e.w}\t${e.r}`, [...(byKey.get(`${e.w}\t${e.r}`) ?? []), id])
    const shared = [...byKey.values()].filter((v) => v.length > 1)
    // 96 headword+reading pairs are in two levels (四季 しき in N3 and N2, …): each level's entry is its own word,
    // with its own cards, as it always was; the one repeat within a level (やかん in N2) was always merged
    expect(shared).toHaveLength(96)
    for (const v of shared) expect(new Set(v.map((id) => reg.ids[id].l)).size).toBe(v.length)
    expect(ids.readSource(2).dropped).toEqual([{ w: 'やかん', r: 'やかん' }])
  })

  it('the source and every enrichment input resolve against it without a single problem', () => {
    const levels = loadWords()
    for (const l of LEVELS) expect(levels[l]).toHaveLength(COUNTS[l])
    expect(loadInputs(levels).problems).toEqual([])
  })

  it('src/generated/word-ids.ts is what the build writes from the registry', () => {
    expect(read('src/generated/word-ids.ts')).toBe(idModule(registry()))
  })
})

/**
 * Words whose type tags (k, sk, ff, rt and the derived a, x) were corrected after the positional files froze: the
 * native review of the tag audit (docs/plan/12, data/tags/audit/review.csv). Every other column of these rows, and
 * every column of all other rows, is still what the frozen file says.
 */
const TAGS_CORRECTED: Record<number, string[]> = {
  5: ['w08t', 'w0ed', 'w0g8'],
  4: ['w0xf'],
  3: ['w1i9', 'w1m9', 'w2gy', 'w2ll', 'w2om'],
  2: ['w326', 'w36f', 'w3hc', 'w3qa', 'w3qu', 'w3ry', 'w3sz', 'w40u'],
  // w4db: its corrected kana headword とりわけ makes it K (was M, rt irr, derived from the wrong headword 副)
  1: ['w4db', 'w4x3', 'w4xx', 'w5at', 'w5fw', 'w5q2', 'w5sv'],
}

describe('data/corrections.json (source columns the registry does not cover)', () => {
  const resolved = () => ids.resolve(sources(), registry()).levels as Record<number, { id: string; w: string; r: string; en: string }[]>
  const find = (levels: ReturnType<typeof resolved>, id: string) => LEVELS.flatMap((l) => levels[l]).find((x) => x.id === id)!

  it('the build applies it: w41j (目下 めした) gets its own gloss, nothing else changes', () => {
    const raw = resolved()
    const built = loadWords()
    expect(find(raw, 'w41j').en).toBe('at present, now')
    expect(find(built, 'w41j').en).toBe('subordinate, junior, inferior')
    for (const l of LEVELS)
      built[l].forEach((x: { id: string; en: string }, i: number) => x.id === 'w41j' || expect(x.en).toBe(raw[l][i].en))
  })

  it('refuses a stale, unknown, empty or out-of-scope correction and then applies none', () => {
    const fix = (words: object) => {
      const levels = resolved()
      return { problems: applyCorrections(levels, { format: 1, words }) as string[], en: find(levels, 'w41j').en }
    }
    const ok = { en: 'subordinate', was: { en: 'at present, now' }, why: 'test' }
    expect(fix({ w41j: ok })).toEqual({ problems: [], en: 'subordinate' })
    const bad = (words: object, re: RegExp) => {
      const { problems, en } = fix({ w41j: ok, ...words })
      expect(problems.join('\n')).toMatch(re)
      expect(en).toBe('at present, now')
    }
    bad({ w41j: { ...ok, was: { en: 'now' } } }, /source changed/)
    bad({ wzzz: ok }, /not a live word id/)
    bad({ w4db: { w: '取り分け', was: { w: 'とりわけ' }, why: 'x' } }, /"w" cannot be corrected here/)
    bad({ w4db: { en: 'especially, above all', was: { en: 'especially, above all' }, why: 'x' } }, /already/)
    bad({ w4db: { why: 'x' } }, /corrects nothing/)
    bad({ w4db: { en: 'x', was: { en: 'especially, above all' } } }, /needs "why"/)
  })
})

describe('public/data', () => {
  for (const l of LEVELS)
    it(`N${l}: words-n${l}.json is the positional file plus the id, row for row (tags as corrected since); o is a permutation; every word is typed`, () => {
      const r = rows(l)
      const old = legacyRows(l)
      expect(r).toHaveLength(COUNTS[l])
      const reg = registry()
      const corrected: string[] = []
      const sourceFixed: string[] = []
      r.forEach((row, i) => {
        // id, w, r, ko, en, o, f never change, except the listed columns of the source corrections; the tag columns
        // only for the listed tag corrections
        const fix = SOURCE_CORRECTED[row[0] as string]
        const was = old[i].slice()
        const now = row.slice(1)
        if (fix) {
          expect(fix.level).toBe(l)
          sourceFixed.push(row[0] as string)
          for (const [c, [before, after]] of Object.entries(fix.cols)) {
            expect(was[+c], `${row[0]} column ${c} in the frozen file`).toEqual(before)
            expect(now[+c], `${row[0]} column ${c} now`).toEqual(after)
            was[+c] = now[+c]
          }
        }
        expect(now.slice(0, 6)).toEqual(was.slice(0, 6))
        if (JSON.stringify(now) !== JSON.stringify(was)) corrected.push(row[0] as string)
        expect(reg.ids[row[0] as string].legacy).toBe(`${l}-${i}`)
      })
      expect(corrected.sort()).toEqual(TAGS_CORRECTED[l])
      expect(sourceFixed.sort()).toEqual(Object.keys(SOURCE_CORRECTED).filter((id) => SOURCE_CORRECTED[id].level === l).sort())
      const o = r.map((row) => row[5] as number)
      expect([...o].sort((a, b) => a - b)).toEqual(o.map((_, i) => i))
      for (const row of r) {
        expect(row.length).toBeGreaterThanOrEqual(8)
        expect(['S', 'F', 'J', 'N', 'M', 'L', 'K']).toContain(row[7])
        if (row[7] === 'S' || row[7] === 'F' || row[7] === 'J') expect(row[8]).toMatch(/^[가-힣]+$/)
        if (row[7] === 'F') expect(row[9]).toMatch(/^한국어 '/)
      }
    })

  for (const l of LEVELS)
    it(`N${l}: n${l}.json, read by tabs still running the version before stable ids, is frozen byte for byte`, () => {
      expect(createHash('sha256').update(readFileSync(new URL(`../../public/data/n${l}.json`, import.meta.url))).digest('hex')).toBe(FROZEN[l])
    })
})

describe('ids do not depend on the source’s order or contents (property)', { timeout: 60_000 }, () => {
  const base = sources()
  const reg0 = registry()
  const want = idsByWord(ids.resolve(base, reg0).levels)

  it('shuffling rows never changes an id (40 random orders of every level)', () => {
    const rnd = rng(1)
    for (let k = 0; k < 40; k++) {
      const src = Object.fromEntries(LEVELS.map((l) => [l, shuffle(base[l], rnd)]))
      const { errors, levels } = ids.resolve(src, reg0)
      expect(errors).toEqual([])
      const got = idsByWord(levels)
      expect(got.size).toBe(8130)
      for (const [key, id] of got) expect(id).toBe(want.get(key))
    }
  })

  it('inserting words: the build refuses until they get new ids, and the new ids leave every existing id alone', () => {
    const rnd = rng(2)
    for (let k = 0; k < 20; k++) {
      const reg = structuredClone(reg0)
      const src = Object.fromEntries(LEVELS.map((l) => [l, base[l].slice()]))
      const added: string[] = []
      for (let n = 1 + Math.floor(rnd() * 5); n > 0; n--) {
        const l = LEVELS[Math.floor(rnd() * 5)]
        const w = { w: `新語${k}-${n}`, r: `しんご${k}${n}`, en: 'new word' }
        src[l].splice(Math.floor(rnd() * (src[l].length + 1)), 0, w)
        added.push(`${l}\t${w.w}\t${w.r}`)
      }
      const before = ids.resolve(src, reg)
      expect(before.errors.length).toBe(added.length)
      expect(before.errors.every((e: string) => e.includes('has no registered id'))).toBe(true)
      const issued = ids.assignNew(src, reg)
      expect(issued).toHaveLength(added.length)
      // new ids are fresh: above every id ever issued
      for (const id of issued) expect(ids.counterOf(id)).toBeGreaterThanOrEqual(reg0.next)
      const { errors, levels } = ids.resolve(src, reg)
      expect(errors).toEqual([])
      const got = idsByWord(levels)
      for (const [key, id] of want) expect(got.get(key)).toBe(id)
      // and a new word is listed after the existing ones of its level, whatever its place in the file
      for (const l of LEVELS) expect(levels[l].slice(0, COUNTS[l]).map((x: { id: string }) => x.id)).toEqual(ids.resolve(base, reg0).levels[l].map((x: { id: string }) => x.id))
    }
  })

  it('removing words: the build refuses an id that disappears without a tombstone; with one, every other id stays', () => {
    const rnd = rng(3)
    for (let k = 0; k < 20; k++) {
      const reg = structuredClone(reg0)
      const src = Object.fromEntries(LEVELS.map((l) => [l, base[l].slice()]))
      const gone: string[] = []
      for (let n = 1 + Math.floor(rnd() * 5); n > 0; n--) {
        const l = LEVELS[Math.floor(rnd() * 5)]
        const [x] = src[l].splice(Math.floor(rnd() * src[l].length), 1)
        gone.push(want.get(`${l}\t${x.w}\t${x.r}`)!)
      }
      const refused = ids.resolve(src, reg)
      expect(refused.errors.length).toBe(gone.length)
      expect(refused.errors.every((e: string) => e.includes('registered but not in the source'))).toBe(true)
      for (const id of gone) reg.ids[id].retired = '2026-11-14: test'
      const { errors, levels } = ids.resolve(src, reg)
      expect(errors).toEqual([])
      const got = idsByWord(levels)
      expect(got.size).toBe(8130 - gone.length)
      for (const [key, id] of got) expect(id).toBe(want.get(key))
      // a removed word that comes back must be revived, not re-issued
      const back = ids.resolve(base, reg)
      expect(back.errors.length).toBe(gone.length)
      expect(back.errors.every((e: string) => e.includes('matches retired id'))).toBe(true)
      expect(ids.assignNew(base, reg)).toEqual([])
    }
  })

  it('a corrected headword or a level change keeps the id when its entry is edited; the build refuses a silent change', () => {
    const reg = structuredClone(reg0)
    const id = want.get('3\t四季\tしき')!
    const src = Object.fromEntries(LEVELS.map((l) => [l, base[l].slice()]))
    // a typo fix in the source alone
    src[3] = src[3].map((x) => (x.w === '四季' ? { ...x, w: '四季（しき）' } : x))
    expect(ids.resolve(src, reg).errors.join('\n')).toMatch(new RegExp(`${id}.*registered but not in the source`))
    reg.ids[id].w = '四季（しき）'
    expect(ids.resolve(src, reg).errors).toEqual([])
    expect(idsByWord(ids.resolve(src, reg).levels).get('3\t四季（しき）\tしき')).toBe(id)
    // moved from N3 to N1
    const moved = Object.fromEntries(LEVELS.map((l) => [l, src[l].slice()]))
    const word = moved[3].find((x) => x.w === '四季（しき）')!
    moved[3] = moved[3].filter((x) => x !== word)
    moved[1] = [...moved[1], word]
    expect(ids.resolve(moved, reg).errors.length).toBe(2)
    reg.ids[id].l = 1
    const { errors, levels } = ids.resolve(moved, reg)
    expect(errors).toEqual([])
    expect(levels[1].some((x: { id: string }) => x.id === id)).toBe(true)
  })

  it('fails loudly on a broken registry: a shared word, a malformed id, an id at or above `next`', () => {
    const dup = structuredClone(reg0)
    const [a, b] = Object.keys(dup.ids)
    dup.ids[b] = { ...dup.ids[a] }
    expect(ids.resolve(base, dup).errors.join('\n')).toMatch(/both claim/)
    const bad = structuredClone(reg0)
    bad.ids.w0001 = { l: 5, w: 'x', r: 'x', retired: 'x' }
    bad.ids.wzzz = { l: 5, w: 'y', r: 'y', retired: 'y' }
    const e = ids.resolve(base, bad).errors.join('\n')
    expect(e).toMatch(/w0001: not a well-formed id/)
    expect(e).toMatch(/wzzz: counter \d+ is not below "next"/)
  })
})
