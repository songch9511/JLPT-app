// Word pictures (docs/design-system.md §3 "학습 카드" › 그림): public/img/words/<word id>.webp, listed at build time in
// src/generated/content.ts (scripts/build-data.mjs `readPictures`), which is all the app goes by.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain JS build helpers
import { contentModule, readPictures } from '../../scripts/build-data.mjs'
import { WORD_PICTURES } from '../../src/generated/content'
import { isWordId } from '../../src/ids'
import { hasPicture, pictureUrl } from '../../src/pictures'

const DIR = new URL('../../public/img/words/', import.meta.url)

describe('word pictures: the generated list', () => {
  it('is exactly the .webp files in public/img/words (run `npm run data` after adding or removing one)', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort()
    expect([...WORD_PICTURES]).toEqual(files)
  })

  it('names live word ids only, in id order, each once', () => {
    expect(WORD_PICTURES.length).toBeGreaterThan(0)
    for (const id of WORD_PICTURES) expect(isWordId(id), id).toBe(true)
    expect([...WORD_PICTURES]).toEqual([...new Set(WORD_PICTURES)].sort())
  })

  it('is what the app asks: a listed word has a picture, a kanji card or an unlisted id has none', () => {
    for (const id of WORD_PICTURES) expect(hasPicture(id), id).toBe(true)
    expect(hasPicture('k猫')).toBe(false)
    expect(hasPicture('w0e7')).toBe(WORD_PICTURES.includes('w0e7'))
    expect(hasPicture('wzzzz')).toBe(false)
    expect(pictureUrl('w0e7')).toMatch(/img\/words\/w0e7\.webp$/)
  })

  it('the module carries the list sorted', () => {
    const src = contentModule([5], [], ['w0eh', 'w0e7'])
    expect(src).toContain('export const WORD_PICTURES: readonly string[] = ["w0e7","w0eh"]')
  })
})

describe('word pictures: the build check', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'word-pics-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))
  const known = new Set(['w0e7', 'w0eh'])
  const folder = (...names: string[]) => {
    const d = mkdtempSync(join(tmp, 'd'))
    for (const n of names) writeFileSync(join(d, n), '')
    return d
  }

  it('takes every <live id>.webp and leaves other files alone', () => {
    expect(readPictures(known, folder('w0eh.webp', 'w0e7.webp', '.DS_Store', 'w0e7.webp.part'))).toEqual({ ids: ['w0e7', 'w0eh'], problems: [] })
  })

  it('fails, naming the file, on a name that is not a live word id or an upper-case extension', () => {
    const { ids, problems } = readPictures(known, folder('w0e7.webp', 'cat.webp', 'w999.webp', 'w0eh.WEBP'))
    expect(ids).toEqual(['w0e7'])
    expect(problems.join('\n')).toMatch(/cat\.webp: "cat" is not a live word id/)
    expect(problems.join('\n')).toMatch(/w999\.webp: "w999" is not a live word id/)
    expect(problems.join('\n')).toMatch(/w0eh\.WEBP: the extension must be \.webp/)
  })

  it('no folder: no pictures', () => {
    const missing = join(tmp, 'none')
    expect(readPictures(known, missing)).toEqual({ ids: [], problems: [] })
    mkdirSync(missing)
    expect(readPictures(known, missing)).toEqual({ ids: [], problems: [] })
  })
})
