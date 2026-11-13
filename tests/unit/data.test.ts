// The shipped word data (public/data): extra columns appended, the first four columns and the row order
// (= word ids) never changed.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const COUNTS: Record<number, number> = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2699 }
/** sha256 of each file as it was before the extra columns (rows [w, r, ko, en]), i.e. at commit f7d4987. */
const FOUR_COLUMNS: Record<number, string> = {
  1: '0fe356ce0075fea25216e549043f6fcf9c801c50d4718f5d6b7f8924e8c8e33d',
  2: 'bd075603daf532854aff90290077c193a69816eea2b06484149f3bbd312c5f00',
  3: 'f3a478e979463b7b7a425b9df6798206354231fd712259dc06ef164f02c4df33',
  4: 'aa6c512e933416facf4bcee734b1cd46e08513f0fe8073548cca7c815d7111b8',
  5: '66ebd9cc8d37001fca3cf444515498d2d7788bbea4ff88acfd1fb50966dbcbe8',
}
const rows = (l: number) => JSON.parse(readFileSync(new URL(`../../public/data/n${l}.json`, import.meta.url), 'utf8')) as unknown[][]

describe('public/data', () => {
  for (const l of [5, 4, 3, 2, 1])
    it(`N${l}: the first four columns are byte for byte what they were; o is a permutation; every word is typed`, () => {
      const r = rows(l)
      expect(r).toHaveLength(COUNTS[l])
      const four = JSON.stringify(r.map((row) => row.slice(0, 4)))
      expect(createHash('sha256').update(four).digest('hex')).toBe(FOUR_COLUMNS[l])
      const o = r.map((row) => row[4] as number)
      expect([...o].sort((a, b) => a - b)).toEqual(o.map((_, i) => i))
      for (const row of r) {
        expect(row.length).toBeGreaterThanOrEqual(7)
        expect(['S', 'F', 'J', 'N', 'M', 'L', 'K']).toContain(row[6])
        if (row[6] === 'S' || row[6] === 'F' || row[6] === 'J') expect(row[7]).toMatch(/^[가-힣]+$/)
        if (row[6] === 'F') expect(row[8]).toMatch(/^한국어 '/)
      }
    })
})
