// Word pictures (docs/design-system.md §3 "학습 카드" › 그림, 2026-11-20 "A안"): a word with a picture has a fixed
// 16:9 tile at the top of its card's centre, empty until 의미 opens (or 모르겠어요 opens everything), then the picture
// in it; 히라가나 alone does not show it, and nothing on the card moves. A word without one has no tile. The past card,
// 다시 보기 and the word sheet show it with the meaning. The words used here have their files now; more files may be
// added at any time, so nothing below depends on which other words have one.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, axeViolations, NOW, open, READ_MS, user } from './fixtures'
import { WORD_PICTURES } from '../../src/generated/content'
import type { Example } from '../../src/examples'

type Row = [string, string, string, string, string, number, number, ...string[]]
const N5 = JSON.parse(readFileSync(new URL('../../public/data/words-n5.json', import.meta.url), 'utf8')) as Row[]
const EX = JSON.parse(readFileSync(new URL('../../public/data/examples-n5.json', import.meta.url), 'utf8')) as Record<string, Example>
const ORDER = [...N5].sort((a, b) => a[5] - b[5])
const ROW = new Map(N5.map((r) => [r[0], r]))
const T = NOW.getTime()
const DAY = 86_400_000
const HAS = new Set(WORD_PICTURES)

/** 猫 ねこ 고양이: a word with a picture. */
const CAT = 'w0e7'
const cat = ROW.get(CAT)!
/** The first word met without a picture (whichever it is when the test runs). */
const PLAIN = ORDER.find((r) => !HAS.has(r[0]) && r[2] && EX[r[0]])!

const known = { stability: 30, difficulty: 5, elapsed_days: 3, scheduled_days: 23, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: T - 3 * DAY }
/** Review cards for every word before `id` in the introduction order, due well after today: `id` is the next new word. */
const before = (id: string) => Object.fromEntries(ORDER.slice(0, ORDER.findIndex((r) => r[0] === id)).map((r) => [r[0], { ...known, due: T + 20 * DAY }]))
const study = (page: Page, id: string, settings: Record<string, unknown> = {}) =>
  open(page, { state: { ...user({ dailyNew: 1, ...settings }), v: 4, cards: before(id) }, hash: '/study' })

const card = (page: Page) => page.locator('.card-slot:not([inert]) .flash')
const box = async (page: Page, sel: string) => (await card(page).locator(sel).first().boundingBox())!
/** The requests for picture files the page has made. */
const pictureRequests = (page: Page) => {
  const urls: string[] = []
  page.on('request', (r) => r.url().includes('/img/words/') && urls.push(r.url()))
  return urls
}
/** Once the picture has loaded and faded in. */
const loaded = (page: Page, scope = card(page)) =>
  expect.poll(() => scope.locator('.word-pic img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1')).toBe(true)

test.beforeAll(() => expect(HAS.has(CAT), `${CAT} has a picture`).toBe(true))

test('a word with a picture: the tile is there and empty from the start, the picture shows with 의미 (not with 히라가나 alone), and nothing moves', async ({ page }) => {
  const asked = pictureRequests(page)
  await study(page, CAT)
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  const tile = card(page).locator('.word-pic')
  const meaning = page.getByRole('button', { name: '의미', exact: true })
  const kana = page.getByRole('button', { name: '히라가나', exact: true })
  await page.waitForTimeout(400)

  // closed: the empty tile, quiet and hidden from screen readers; the file is not asked for yet
  await expect(tile).toBeVisible()
  await expect(tile).toHaveAttribute('aria-hidden', 'true')
  await expect(tile.locator('svg')).toBeVisible()
  await expect(tile.locator('img')).toHaveCount(0)
  // at the top of the centre, above the reading's slot: the card's full inner width, 16:9, corner 16, 12px under it
  const body = await box(page, '.flash-body')
  const t = await box(page, '.word-pic')
  expect(t.width).toBeCloseTo(body.width, 0)
  expect(t.height).toBeCloseTo((t.width * 9) / 16, 0)
  expect(t.y).toBeLessThanOrEqual(body.y + 1)
  expect((await box(page, '.flash-reading')).y - (t.y + t.height)).toBeCloseTo(12, 0)
  expect(await tile.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('16px')
  const at = { tile: t, word: await box(page, '.flash-word'), example: await box(page, '.flash-example'), toggles: await box(page, '.flash-toggles') }
  const still = async () => {
    await page.waitForTimeout(300)
    expect(await box(page, '.word-pic')).toEqual(at.tile)
    expect(await box(page, '.flash-word')).toEqual(at.word)
    expect(await box(page, '.flash-example')).toEqual(at.example)
    expect(await box(page, '.flash-toggles')).toEqual(at.toggles)
  }

  // 히라가나 alone: the reading, still no picture
  await kana.click()
  await expect(page.locator('.flash-reading')).toBeVisible()
  await expect(tile.locator('img')).toHaveCount(0)
  await expect(tile).toHaveAttribute('aria-hidden', 'true')
  await still()
  expect(asked).toEqual([])

  // 의미: the picture, named by the meaning
  await meaning.click()
  const img = page.getByRole('img', { name: cat[3], exact: true })
  await expect(img).toBeVisible()
  await loaded(page)
  await expect(tile).not.toHaveAttribute('aria-hidden')
  expect(await img.evaluate((e: HTMLImageElement) => getComputedStyle(e).objectFit)).toBe('cover')
  expect(asked).toHaveLength(1)
  expect(asked[0]).toMatch(new RegExp(`/img/words/${CAT}\\.webp$`))
  await still()

  // 의미 off again: the empty tile (the file stays loaded), then on
  await meaning.click()
  await expect(tile.locator('img')).not.toBeVisible()
  await expect(tile).toHaveAttribute('aria-hidden', 'true')
  await kana.click()
  await still()
  await meaning.click()
  await expect(img).toBeVisible()
  await still()
  expect(asked).toHaveLength(1)
})

test('“모르겠어요” opens everything, the picture with it; with reduced motion it shows at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await study(page, CAT)
  await expect(card(page).locator('.word-pic img')).toHaveCount(0)
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
  await loaded(page)
  expect(await card(page).locator('.word-pic img').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s')
  expect(await axeViolations(page)).toEqual([])
})

test('a picture that cannot be loaded (offline on the web) leaves the quiet empty tile: no broken image, no message', async ({ page }) => {
  await page.route('**/img/words/*.webp', (r) => r.abort('internetdisconnected'))
  await study(page, CAT)
  await page.waitForTimeout(400)
  const at = await box(page, '.word-pic')
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  const tile = card(page).locator('.word-pic')
  await expect(tile.locator('img')).toHaveCount(0)
  await expect(tile).toHaveAttribute('aria-hidden', 'true')
  await expect(tile.locator('svg')).toBeVisible()
  await expect(tile).toHaveText('')
  expect(await box(page, '.word-pic')).toEqual(at)
})

test('a word without a picture: no tile, and the card as it was', async ({ page }) => {
  const asked = pictureRequests(page)
  await study(page, PLAIN[0])
  await expect(page.locator('.flash-word')).toHaveText(PLAIN[1])
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  await expect(page.locator('.word-pic')).toHaveCount(0)
  const body = card(page).locator('.flash-body')
  await expect(body).not.toHaveClass(/has-pic/)
  // the spacing and the headword of a card without a picture (styles.css: gap 4px, the 84px headword at 390px)
  expect(await body.evaluate((e) => getComputedStyle(e).rowGap)).toBe('4px')
  if (PLAIN[1].length <= 3) expect(parseFloat(await page.locator('.flash-word').evaluate((e) => getComputedStyle(e).fontSize))).toBeCloseTo(390 * 0.215, 0)
  expect(asked).toEqual([])
})

test('the past card shows the picture with its meaning', async ({ page }) => {
  // 猫 now, the next new word after it
  await study(page, CAT, { dailyNew: 2 })
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  await answer(page, '알아요')
  await expect(page.locator('.flash-word')).not.toHaveText(cat[1])
  await page.keyboard.press('ArrowLeft')
  const past = page.locator('.card-slot:not([inert]) .flash.past')
  await expect(past.locator('.flash-word')).toHaveText(cat[1])
  await expect(past.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
  await loaded(page, past)
})

test('다시 보기 shows the picture on the same rule: an empty tile, then the picture with 의미', async ({ page }) => {
  // 猫 as a weak word (forgotten often), the one card of the weak words' 다시 보기
  await open(page, { state: { ...user(), v: 4, cards: { [CAT]: { ...known, lapses: 9, due: T + 20 * DAY } } }, hash: '/practice/weak' })
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  const tile = card(page).locator('.word-pic')
  await expect(tile).toBeVisible()
  await expect(tile.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: '히라가나', exact: true }).click()
  await expect(tile.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
  await loaded(page)
})

test('the word sheet: the picture at the top, above the headword; no tile for a word without one', async ({ page }) => {
  await open(page, { state: user(), hash: '/search/word' })
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill(cat[1])
  await page.locator('.word-row').filter({ hasText: cat[3] }).first().click()
  const sheet = page.getByRole('dialog')
  const img = sheet.getByRole('img', { name: cat[3], exact: true })
  await expect(img).toBeVisible()
  await loaded(page, sheet)
  // the sheet has finished sliding in
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(300)
  const pic = (await sheet.locator('.word-pic').boundingBox())!
  const word = (await sheet.locator('.sheet-word').boundingBox())!
  const head = (await sheet.locator('.sheet-head').boundingBox())!
  expect(pic.y).toBeGreaterThanOrEqual(head.y + head.height - 1)
  expect(pic.y + pic.height).toBeLessThan(word.y)
  expect(pic.height).toBeCloseTo((pic.width * 9) / 16, 0)
  await page.screenshot({ path: test.info().outputPath('sheet.png') })

  await page.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toHaveCount(0)
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill(PLAIN[1])
  await page.locator('.word-row').filter({ hasText: PLAIN[3] }).first().click()
  await expect(page.getByRole('dialog').locator('.sheet-word')).toHaveText(PLAIN[1])
  await expect(page.getByRole('dialog').locator('.word-pic')).toHaveCount(0)
})

test('dark mode: the empty tile is on the kanji chips’ dark ground', async ({ page }) => {
  await study(page, CAT, { theme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const tile = card(page).locator('.word-pic')
  await expect(tile).toBeVisible()
  const ground = await tile.evaluate((e) => getComputedStyle(e).backgroundColor)
  // the screen's dark ground, under the lighter dark card; the same as the kanji chips'
  expect(ground).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
  expect(ground).not.toBe(await card(page).evaluate((e) => getComputedStyle(e).backgroundColor))
  expect(await card(page).locator('.kanji-chip').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(ground)
  const [r, g, b] = ground.match(/\d+/g)!.map(Number)
  expect(r + g + b, 'dark').toBeLessThan(120)
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await loaded(page)
  expect(await axeViolations(page)).toEqual([])
})

/**
 * The hardest card with a picture to fit: a word with kanji chips and the longest example sentence among those with a
 * picture (then the shortest meaning, so the meaning stays one line as most do).
 */
const TALL = [...WORD_PICTURES]
  .map((id) => ROW.get(id))
  .filter((r): r is Row => !!r && !!EX[r[0]] && /\p{Script=Han}/u.test(r[1]) && r[1].length <= 3)
  .sort((a, b) => EX[b[0]].seg.map((g) => g[0]).join('').length - EX[a[0]].seg.map((g) => g[0]).join('').length || a[3].length - b[3].length)[0]

for (const [width, height] of [
  [390, 844],
  [375, 667],
] as const)
  test(`${width}×${height}: a card with its picture, the longest example and kanji chips fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await study(page, TALL[0])
    await expect(page.locator('.flash-word')).toHaveText(TALL[1])
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await loaded(page)
    await expect(card(page).locator('.kanji-chip').first()).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: test.info().outputPath(`${width}x${height}.png`) })
    const m = await card(page).locator('.flash-scroll').evaluate((s) => {
      const r = s.getBoundingClientRect()
      const parts = [...s.querySelectorAll('.word-pic, .flash-reading, .flash-word, .flash-meaning-slot, .example-ja, .example-ko, .kanji-row')].map((e) => e.getBoundingClientRect())
      return { overflow: s.scrollHeight - s.clientHeight, top: r.top, bottom: r.bottom, outside: parts.filter((p) => p.top < r.top - 0.5 || p.bottom > r.bottom + 0.5).length }
    })
    expect(m.overflow, 'the card does not scroll').toBeLessThanOrEqual(0)
    expect(m.outside, 'every part inside the card').toBe(0)
    // the picture keeps the card's full width and a useful height; on the phone the mockups were drawn for, all of it
    const t = await box(page, '.word-pic')
    expect(t.width).toBeCloseTo((await box(page, '.flash-body')).width, 0)
    expect(t.height).toBeGreaterThanOrEqual(48)
    if (height >= 844) expect(t.height).toBeGreaterThan((t.width * 9) / 16 * 0.85)
    // the grades stay on screen
    for (const b of await page.locator('.answer-bar').getByRole('button').all()) expect((await b.boundingBox())!.y + (await b.boundingBox())!.height).toBeLessThanOrEqual(height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
