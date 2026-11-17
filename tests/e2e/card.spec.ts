// The study card (docs/design-system.md §3 "학습 카드", 2026-11-16): the headword alone, the example sentence below it
// (N5), two toggles that open on their own — 의미 (the meaning, the example's translation, the kanji's Korean
// readings) and 히라가나 (the reading, the headword's furigana in the example, the kanji's Japanese readings) — and
// the three grades from the start. Nothing on the card moves when something opens; nothing opens on a tap but the
// toggles and the bookmark.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, NOW, open, READ_MS, todayLog, user } from './fixtures'
import { headwordSegments, type Example } from '../../src/examples'
import { kanjiParts } from '../../src/sound'

type Row = [string, string, string, string, string, number, number, string?, string?, string?, string?, string?, string?]
const N5 = JSON.parse(readFileSync(new URL('../../public/data/words-n5.json', import.meta.url), 'utf8')) as Row[]
const EX = JSON.parse(readFileSync(new URL('../../public/data/examples-n5.json', import.meta.url), 'utf8')) as Record<string, Example>
const ORDER = [...N5].sort((a, b) => a[5] - b[5])
const T = NOW.getTime()
const DAY = 86_400_000
const word = (r: Row) => ({ w: r[1], sk: r[8] ?? '', rt: r[10] ?? '', a: r[11] ?? '' })
/** Review cards for every word before `id` in the introduction order, due well after today: `id` is the next new word. */
const before = (id: string) =>
  Object.fromEntries(
    ORDER.slice(0, ORDER.findIndex((r) => r[0] === id)).map((r) => [
      r[0],
      { due: T + 20 * DAY, stability: 30, difficulty: 5, elapsed_days: 3, scheduled_days: 23, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: T - 3 * DAY },
    ]),
  )
/** The first word met that has everything on the card: a reading, kanji paired with their readings, and an example
 * where the headword is found and other kanji carry furigana too. */
const FULL = ORDER.find((r) => {
  const e = EX[r[0]]
  const head = e && headwordSegments(r[1], e.seg)
  return r[2] && r[7] !== 'S' && kanjiParts(word(r)).length > 0 && head.some(Boolean) && e.seg.some((g, i) => g[1] && !head[i])
})!
const studyFull = (page: Page, extra: Record<string, unknown> = {}) =>
  open(page, { state: { ...user({ dailyNew: 1, ...extra }), v: 4, cards: before(FULL[0]) }, hash: '/study' })

const visible = (page: Page, sel: string) => page.locator(`.card-slot:not([inert]) ${sel}`)
const box = async (page: Page, sel: string) => (await visible(page, sel).first().boundingBox())!

test('the card closed: the level, the kind, the headword and the example with every furigana but the headword’s; nothing else', async ({ page }) => {
  await studyFull(page)
  const card = page.locator('.flash')
  await expect(page.locator('.flash-word')).toHaveText(FULL[1])
  await expect(card.locator('.flash-head .level-badge')).toHaveText('N5')
  await expect(card.locator('.flash-head .flash-meta')).toHaveText('새 단어')
  // the example, Japanese only, with real ruby
  const e = EX[FULL[0]]
  await expect(card.locator('.example-ja')).toHaveText(new RegExp(`^${e.seg.map((g) => g[0] + (g[1] ?? '')).join('').replace(/[?？]/g, '.')}$`))
  const head = headwordSegments(FULL[1], e.seg)
  const rts = card.locator('.example-ja rt')
  const readings = e.seg.filter((g) => g[1])
  await expect(rts).toHaveCount(readings.length)
  let k = 0
  for (const [i, g] of e.seg.entries()) {
    if (!g[1]) continue
    await expect(rts.nth(k)).toHaveText(g[1])
    // the headword's furigana is held back; every other kanji keeps its own
    if (head[i]) await expect(rts.nth(k)).not.toBeVisible()
    else await expect(rts.nth(k)).toBeVisible()
    k++
  }
  await expect(card.locator('.flash-meaning')).not.toBeVisible()
  await expect(card.locator('.flash-reading')).not.toBeVisible()
  await expect(card.locator('.example-ko')).not.toBeVisible()
  await expect(card.locator('.kanji-row')).not.toBeVisible()
  // no word-type tag on the card (it is in the word sheet), no "자세히", no divider inside the card
  await expect(card.locator('.type-line')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /자세히|단어 정보/ })).toHaveCount(0)
  const lines = await card.locator('.flash-body').evaluate((body) =>
    [body, ...body.querySelectorAll('*')].filter((n) => {
      const cs = getComputedStyle(n)
      return (['Top', 'Bottom'] as const).some((side) => cs[`border${side}Style`] !== 'none' && parseFloat(cs[`border${side}Width`]) > 0)
    }).map((n) => n.className),
  )
  expect(lines).toEqual([])
})

test('의미 and 히라가나 open on their own; the headword and the example never move', async ({ page }) => {
  await studyFull(page)
  const meaning = page.getByRole('button', { name: '의미', exact: true })
  const kana = page.getByRole('button', { name: '히라가나', exact: true })
  const e = EX[FULL[0]]
  const head = headwordSegments(FULL[1], e.seg)
  const headRt = page.locator('.example-head rt').first()
  const otherRt = page.locator('.example-ja ruby:not(.example-head) rt').first()
  const parts = kanjiParts(word(FULL))
  await expect(page.locator('.flash-word')).toBeVisible()
  await page.waitForTimeout(400)
  const at = { word: await box(page, '.flash-word'), example: await box(page, '.flash-example') }
  const check = async (m: boolean, r: boolean) => {
    await expect(meaning).toHaveAttribute('aria-pressed', String(m))
    await expect(kana).toHaveAttribute('aria-pressed', String(r))
    for (const [sel, on] of [['.flash-meaning', m], ['.example-ko', m], ['.kanji-ko', m], ['.flash-reading', r], ['.kanji-ja', r]] as const) {
      if (on) await expect(page.locator(sel).first(), sel).toBeVisible()
      else await expect(page.locator(sel).first(), sel).not.toBeVisible()
    }
    if (m) await expect(page.locator('.flash-meaning')).toHaveText(FULL[3])
    if (r) await expect(page.locator('.flash-reading')).toHaveText(FULL[2])
    if (head.some(Boolean)) r ? await expect(headRt).toBeVisible() : await expect(headRt).not.toBeVisible()
    await expect(otherRt).toBeVisible()
    // the kanji row: a chip per kanji, there (as room) in every state, shown once either toggle is on
    await expect(page.locator('.kanji-chip')).toHaveCount(parts.length)
    if (m || r) await expect(page.locator('.kanji-row')).toBeVisible()
    else await expect(page.locator('.kanji-row')).not.toBeVisible()
    await page.waitForTimeout(250)
    expect(await box(page, '.flash-word')).toEqual(at.word)
    expect(await box(page, '.flash-example')).toEqual(at.example)
  }
  await check(false, false)
  await meaning.click()
  await check(true, false)
  await kana.click()
  await check(true, true)
  await meaning.click()
  await check(false, true)
  await kana.click()
  await check(false, false)
  // toggling grades nothing
  expect(await todayLog(page)).toBeUndefined()
})

test('“모르겠어요” before anything is open opens everything; the three grades stay, and 모르겠어요 again grades it', async ({ page }) => {
  await studyFull(page)
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  await expect(page.locator('.flash-reading')).toBeVisible()
  await expect(page.locator('.example-head rt').first()).toBeVisible()
  await expect(page.locator('.example-ko')).toBeVisible()
  await expect(page.getByRole('button', { name: '의미', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '히라가나', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.answer-bar .grade-label')).toHaveText(['모르겠어요', '알아요', '쉬워요'])
  expect(await todayLog(page)).toBeUndefined()
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
  expect((await todayLog(page)).r ?? 0).toBe(0)
})

test('“모르겠어요” once everything is open grades at once; 알아요 after it is still 알아요', async ({ page }) => {
  await studyFull(page, { dailyNew: 2 })
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^알아요/ }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
  // the next card: both toggles on by hand, then 모르겠어요 grades
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await page.getByRole('button', { name: '히라가나', exact: true }).click()
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
})

test('the card’s facts: a review says so, with the times it was forgotten', async ({ page }) => {
  const lapsed = { due: T - DAY, stability: 4, difficulty: 6, elapsed_days: 4, scheduled_days: 4, learning_steps: 0, reps: 5, lapses: 1, state: 2, last_review: T - 5 * DAY }
  await open(page, { state: { ...user({ dailyNew: 0 }), v: 4, cards: { [FULL[0]]: lapsed } }, hash: '/study' })
  await expect(page.locator('.flash-head .flash-meta')).toHaveText('복습 · 1번 잊음')
  await expect(page.locator('.flash-head .level-badge')).toHaveAttribute('data-level', '5')
})

test('an earlier card shows everything open: reading, meaning, every furigana, the translation, the kanji', async ({ page }) => {
  await studyFull(page, { dailyNew: 2 })
  await expect(page.locator('.flash-word')).toHaveText(FULL[1])
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^알아요/ }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
  await page.keyboard.press('ArrowLeft')
  const past = page.locator('.flash.past')
  await expect(past.locator('.flash-meta')).toHaveText('이전 1 / 1')
  await expect(past.locator('.flash-word')).toHaveText(FULL[1])
  for (const sel of ['.flash-reading', '.flash-meaning', '.example-ko', '.kanji-row', '.kanji-ko', '.kanji-ja']) await expect(past.locator(sel).first(), sel).toBeVisible()
  for (const rt of await past.locator('.example-ja rt').all()) await expect(rt).toBeVisible()
  await expect(past.locator('.flash-toggles')).toHaveCount(0)
})

test('every level with an example file shows its examples (N4 here, loaded with its first card)', async ({ page }) => {
  await open(page, { state: user({ target: 4, includeLower: false, dailyNew: 3 }), hash: '/study' })
  await expect(page.locator('.flash-word')).toBeVisible()
  await expect(page.locator('.flash-head .level-badge')).toHaveText('N4')
  await expect(page.locator('.flash-example')).toHaveCount(1)
  await expect(page.locator('.example-ja')).toHaveText(/[。？]$/)
  await answer(page, '알아요')
})

test('the word sheet (단어장) shows the example with all its furigana and the translation', async ({ page }) => {
  await open(page, { state: user(), hash: '/search/word' })
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill(FULL[1])
  await page.locator('.word-row').filter({ hasText: FULL[3] }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('.level-badge')).toHaveText('N5')
  await expect(sheet.locator('.example-ko')).toHaveText(EX[FULL[0]].ko)
  for (const rt of await sheet.locator('.example-ja rt').all()) await expect(rt).toBeVisible()
  // the word's type (or its false-friend warning) stays in the sheet
  await expect(sheet.locator('.type-line, .false-friend')).toHaveCount(1)
})

for (const large of [false, true])
  test(`320×568${large ? ' with the largest text sizes' : ''}: everything open stays inside the card, the card scrolls, the grades stay on screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await studyFull(page)
    await expect(page.locator('.flash-word')).toBeVisible()
    if (large)
      await page.evaluate(() => {
        const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
        for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
        document.documentElement.dataset.textSize = 'large'
      })
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await page.getByRole('button', { name: '히라가나', exact: true }).click()
    await page.waitForTimeout(400)
    const card = (await page.locator('.flash').boundingBox())!
    // nothing in the card sticks out sideways: the sentence wraps, a reading wider than its kanji widens the word
    const out = await page.locator('.flash').evaluate((el) => {
      const c = el.getBoundingClientRect()
      return [...el.querySelectorAll('*')].filter((n) => {
        const r = n.getBoundingClientRect()
        return r.width > 0 && (r.left < c.left - 0.5 || r.right > c.right + 0.5)
      }).length
    })
    expect(out).toBe(0)
    expect(card.x + card.width).toBeLessThanOrEqual(320)
    // furigana sit above their own line: no rt overlaps the line above it (the line height leaves room)
    const rects = await page.locator('.example-ja rt').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    for (const r of rects) expect(r.right).toBeLessThanOrEqual(card.x + card.width)
    // the grades are on screen
    for (const b of await page.locator('.answer-bar').getByRole('button').all()) {
      const r = (await b.boundingBox())!
      expect(r.y + r.height).toBeLessThanOrEqual(568)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
