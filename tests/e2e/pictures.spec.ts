// Word pictures (docs/design-system.md §3 "학습 카드" › 그림, 2026-11-21): a word with a picture shows it at the top of
// its card's centre, either once 의미 is open (설정 › 화면 › 단어 그림 "의미와 함께", the default; also when 모르겠어요
// opens everything; 히라가나 alone does not) or from the moment the card appears ("항상"). While it is not shown there
// is nothing in its place: no tile, no icon, no room kept, nothing for a screen reader; a file that cannot be loaded
// never appears. Its file is asked for when the card mounts, so it is there the moment 의미 opens. No text on the card
// changes size when it appears or goes. A word without one has no picture and the card is as it always was. The past
// card, 다시 보기 and the word sheet follow the same rule. The words used here have their files now; more files may
// be added at any time, so nothing below depends on which other words have one.
import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { answer, axeViolations, NOW, open, READ_MS, saved, user } from './fixtures'
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
const studyState = (id: string, settings: Record<string, unknown> = {}) => ({ ...user({ dailyNew: 1, ...settings }), v: 4, cards: before(id) })
const study = (page: Page, id: string, settings: Record<string, unknown> = {}) => open(page, { state: studyState(id, settings), hash: '/study' })
const ALWAYS = { picture: 'always' }

const card = (page: Page) => page.locator('.card-slot:not([inert]) .flash')
const box = async (page: Page, sel: string) => (await card(page).locator(sel).first().boundingBox())!
const meaningBtn = (page: Page) => page.getByRole('button', { name: '의미', exact: true })
const kanaBtn = (page: Page) => page.getByRole('button', { name: '히라가나', exact: true })
/** The requests for picture files the page has made. */
const pictureRequests = (page: Page) => {
  const urls: string[] = []
  page.on('request', (r) => r.url().includes('/img/words/') && urls.push(r.url()))
  return urls
}
/** Once the picture is in and has faded in. */
const loaded = (page: Page, scope: Locator = card(page)) =>
  expect.poll(() => scope.locator('.word-pic img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1')).toBe(true)
/** The picture's section is not there at all: nothing in the DOM, so no tile, no icon, no room, nothing to hear. */
const none = async (scope: Locator) => {
  await expect(scope.locator('.word-pic')).toHaveCount(0)
  await expect(scope.locator('img, svg[class*="image"]')).toHaveCount(0)
  await expect(scope.locator('.flash-body.pic-on')).toHaveCount(0)
}
/** The size of every text on the card, and the kanji chips' (none of it may change when the picture appears). */
const type = (page: Page) =>
  card(page)
    .locator('.flash-body')
    .evaluate((b) =>
      ['.flash-reading', '.flash-word', '.flash-meaning', '.example-ja', '.example-ja rt', '.example-ko', '.kanji-chip', '.kanji-char', '.kanji-ko', '.kanji-ja'].flatMap((sel) =>
        [...b.querySelectorAll(sel)].map((e) => {
          const c = getComputedStyle(e)
          return `${sel}: ${c.fontSize} / ${c.lineHeight}${sel === '.kanji-chip' ? ` / ${c.height}` : ''}`
        }),
      ),
    )
/** Once the card's parts that load on their own (the example, the kanji chips: CAT and TALL have both) are in. */
const settled = async (page: Page) => {
  await expect(card(page).locator('.flash-example')).toBeAttached()
  await expect(card(page).locator('.kanji-chip').first()).toBeAttached()
  await page.waitForTimeout(300)
}
/** The card's centre sits in the middle of its room, like any card: as much space above it as below. */
const centred = async (page: Page) => {
  const m = await card(page)
    .locator('.flash-scroll')
    .evaluate((s) => {
      const r = s.getBoundingClientRect()
      const b = s.querySelector('.flash-body')!.getBoundingClientRect()
      return { above: b.top - r.top, below: r.bottom - b.bottom, overflow: s.scrollHeight - s.clientHeight }
    })
  expect(m.overflow).toBeLessThanOrEqual(0)
  expect(Math.abs(m.above - m.below)).toBeLessThanOrEqual(2)
}

test.beforeAll(() => expect(HAS.has(CAT), `${CAT} has a picture`).toBe(true))

test('의미와 함께 (the default): nothing in its place until 의미 opens (not with 히라가나 alone), then the picture; it goes again with 의미; the file is asked for once, when the card appears', async ({ page }) => {
  const asked = pictureRequests(page)
  await study(page, CAT)
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  // asked for as the card appears, before anything is open, so it is there when 의미 opens
  await expect.poll(() => asked.length).toBe(1)
  expect(asked[0]).toMatch(new RegExp(`/img/words/${CAT}\\.webp$`))
  await settled(page)

  // closed: no picture section at all; the card is laid out as a plain card (its spacing, centred in its room)
  await none(card(page))
  const body = card(page).locator('.flash-body')
  await expect(body).toHaveClass(/has-pic/)
  expect(await body.evaluate((e) => getComputedStyle(e).rowGap)).toBe('4px')
  await centred(page)
  const closedType = await type(page)

  // 히라가나 alone: the reading, still nothing
  await kanaBtn(page).click()
  await expect(page.locator('.flash-reading')).toBeVisible()
  await page.waitForTimeout(300)
  await none(card(page))

  // 의미: the picture at the top of the centre, named by the meaning; the card's full inner width, 16:9, corner 16,
  // 12px above the reading; the spacing tightens, no text changes size
  await meaningBtn(page).click()
  const img = page.getByRole('img', { name: cat[3], exact: true })
  await expect(img).toBeVisible()
  await loaded(page)
  await expect(body).toHaveClass(/pic-on/)
  const b = await box(page, '.flash-body')
  const t = await box(page, '.word-pic')
  expect(t.width).toBeCloseTo(b.width, 0)
  expect(t.height).toBeCloseTo((t.width * 9) / 16, 0)
  expect(t.y).toBeLessThanOrEqual(b.y + 1)
  expect((await box(page, '.flash-reading')).y - (t.y + t.height)).toBeCloseTo(12, 0)
  expect(await card(page).locator('.word-pic').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('16px')
  expect(await img.evaluate((e: HTMLImageElement) => getComputedStyle(e).objectFit)).toBe('cover')
  expect(await type(page)).toEqual(closedType)
  await centred(page)

  // 의미 off again: gone, nothing left in its place; on again: back at once, from the file already loaded
  await meaningBtn(page).click()
  await none(card(page))
  await expect(body).not.toHaveClass(/pic-on/)
  expect(await type(page)).toEqual(closedType)
  await centred(page)
  await meaningBtn(page).click()
  await expect(img).toBeVisible()
  await loaded(page)
  expect(await type(page)).toEqual(closedType)
  expect(asked).toHaveLength(1)
})

test('항상: the picture is there from the moment the card appears, whatever is open, unnamed until 의미 opens; nothing moves when the toggles open', async ({ page }) => {
  const asked = pictureRequests(page)
  await study(page, CAT, ALWAYS)
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  const pic = card(page).locator('.word-pic img')
  await expect(pic).toBeVisible()
  await loaded(page)
  // shown before 의미: not named, so a screen reader does not read the meaning out before it is asked for
  await expect(pic).toHaveAttribute('alt', '')
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toHaveCount(0)
  await expect(card(page).locator('.flash-body')).toHaveClass(/pic-on/)
  await settled(page)
  const at = { pic: await box(page, '.word-pic'), word: await box(page, '.flash-word'), example: await box(page, '.flash-example'), toggles: await box(page, '.flash-toggles') }
  const closedType = await type(page)
  const still = async () => {
    await page.waitForTimeout(300)
    expect(await box(page, '.word-pic')).toEqual(at.pic)
    expect(await box(page, '.flash-word')).toEqual(at.word)
    expect(await box(page, '.flash-example')).toEqual(at.example)
    expect(await box(page, '.flash-toggles')).toEqual(at.toggles)
    expect(await type(page)).toEqual(closedType)
  }

  await kanaBtn(page).click()
  await expect(page.locator('.flash-reading')).toBeVisible()
  await expect(pic).toBeVisible()
  await still()
  await meaningBtn(page).click()
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
  await still()
  await meaningBtn(page).click()
  await expect(pic).toBeVisible()
  await expect(pic).toHaveAttribute('alt', '')
  await still()
  expect(asked).toHaveLength(1)
  expect(await axeViolations(page)).toEqual([])
})

test('“모르겠어요” opens everything, the picture with it; with reduced motion it shows at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await study(page, CAT)
  await page.waitForTimeout(READ_MS)
  await none(card(page))
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
  await loaded(page)
  expect(await card(page).locator('.word-pic img').evaluate((e) => getComputedStyle(e).animationName)).toBe('none')
  expect(await axeViolations(page)).toEqual([])
})

test('the picture fades in when it appears', async ({ page }) => {
  await study(page, CAT)
  await page.waitForTimeout(READ_MS)
  await meaningBtn(page).click()
  const img = card(page).locator('.word-pic img')
  await expect(img).toBeVisible()
  expect(await img.evaluate((e) => getComputedStyle(e).animationName)).toBe('fade')
  expect(parseFloat(await img.evaluate((e) => getComputedStyle(e).animationDuration))).toBeGreaterThan(0)
  await loaded(page)
})

for (const mode of ['meaning', 'always'] as const)
  test(`${mode === 'always' ? '항상' : '의미와 함께'}: a picture that cannot be loaded (offline on the web) never appears: no tile, no broken image, no message, and nothing moves`, async ({ page }) => {
    await page.route('**/img/words/*.webp', (r) => r.abort('internetdisconnected'))
    const asked = pictureRequests(page)
    await study(page, CAT, { picture: mode })
    await expect(page.locator('.flash-word')).toHaveText(cat[1])
    await expect.poll(() => asked.length).toBe(1)
    await settled(page)
    await none(card(page))
    const word = await box(page, '.flash-word')
    const closedType = await type(page)
    await meaningBtn(page).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.waitForTimeout(400)
    await none(card(page))
    expect(await box(page, '.flash-word')).toEqual(word)
    expect(await type(page)).toEqual(closedType)
    await expect(card(page).locator('.flash-body')).not.toContainText('그림')
    await centred(page)
  })

for (const mode of ['meaning', 'always'] as const)
  test(`${mode === 'always' ? '항상' : '의미와 함께'}: a word without a picture: nothing asked for, no section, and the card as it was`, async ({ page }) => {
    const asked = pictureRequests(page)
    await study(page, PLAIN[0], { picture: mode })
    await expect(page.locator('.flash-word')).toHaveText(PLAIN[1])
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await none(card(page))
    const body = card(page).locator('.flash-body')
    await expect(body).not.toHaveClass(/has-pic/)
    // the spacing and the headword of a card without a picture (styles.css: gap 4px, the 84px headword at 390px)
    expect(await body.evaluate((e) => getComputedStyle(e).rowGap)).toBe('4px')
    if (PLAIN[1].length <= 3) expect(parseFloat(await page.locator('.flash-word').evaluate((e) => getComputedStyle(e).fontSize))).toBeCloseTo(390 * 0.215, 0)
    expect(await card(page).locator('.flash-scroll').evaluate((e) => getComputedStyle(e).containerType)).toBe('normal')
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

for (const mode of ['meaning', 'always'] as const)
  test(`다시 보기 follows the same rule (${mode === 'always' ? '항상: at once' : '의미와 함께: nothing, then the picture with 의미'})`, async ({ page }) => {
    // 猫 as a weak word (forgotten often), the one card of the weak words' 다시 보기
    await open(page, { state: { ...user({ picture: mode }), v: 4, cards: { [CAT]: { ...known, lapses: 9, due: T + 20 * DAY } } }, hash: '/practice/weak' })
    await expect(page.locator('.flash-word')).toHaveText(cat[1])
    if (mode === 'always') {
      await expect(card(page).locator('.word-pic img')).toBeVisible()
      await loaded(page)
    } else {
      await page.waitForTimeout(400)
      await none(card(page))
      await kanaBtn(page).click()
      await page.waitForTimeout(300)
      await none(card(page))
    }
    await meaningBtn(page).click()
    await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
    await loaded(page)
  })

test('the word sheet: the picture at the top, above the headword; nothing for a word without one or a file that cannot be loaded', async ({ page }) => {
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

  await page.getByRole('button', { name: '닫기' }).click()
  await expect(sheet).toHaveCount(0)
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill(PLAIN[1])
  await page.locator('.word-row').filter({ hasText: PLAIN[3] }).first().click()
  await expect(page.getByRole('dialog').locator('.sheet-word')).toHaveText(PLAIN[1])
  await expect(page.getByRole('dialog').locator('.word-pic')).toHaveCount(0)
})

test('the word sheet offline: a picture that cannot be loaded leaves nothing above the headword', async ({ page }) => {
  await page.route('**/img/words/*.webp', (r) => r.abort('internetdisconnected'))
  await open(page, { state: user(), hash: '/search/word' })
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill(cat[1])
  await page.locator('.word-row').filter({ hasText: cat[3] }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('.sheet-word')).toHaveText(cat[1])
  await page.waitForTimeout(600)
  await expect(sheet.locator('.word-pic')).toHaveCount(0)
  await expect(sheet.locator('img')).toHaveCount(0)
})

test('설정 › 화면 › 단어 그림: 의미와 함께 by default (also for a state saved before the setting), and 항상 shows the picture on a closed card', async ({ page }) => {
  // the fixture's learner was saved before the setting existed
  await open(page, { state: studyState(CAT, { picture: undefined }), hash: '/settings' })
  // in the 화면 group, under 테마: its name, then the choice
  const group = page.getByRole('region', { name: '화면', exact: true })
  const choice = group.getByRole('radiogroup', { name: '단어 그림' })
  await expect(choice).toBeVisible()
  await expect(group.locator('.field-name')).toHaveText(['테마', '단어 그림'])
  await expect(group.locator('.field-desc')).toHaveCount(0)
  await expect(choice.getByRole('radio')).toHaveText(['의미와 함께', '항상'])
  await expect(choice.getByRole('radio', { name: '의미와 함께' })).toHaveAttribute('aria-checked', 'true')
  await choice.scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('settings.png') })

  await choice.getByRole('radio', { name: '항상' }).click()
  await expect(choice.getByRole('radio', { name: '항상' })).toHaveAttribute('aria-checked', 'true')
  expect((await saved(page)).settings.picture).toBe('always')
  await page.evaluate(() => (location.hash = '/study'))
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  await expect(card(page).locator('.word-pic img')).toBeVisible()
  await loaded(page)

  // and back: the closed card has nothing in the picture's place again
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('radiogroup', { name: '단어 그림' }).getByRole('radio', { name: '의미와 함께' }).click()
  expect((await saved(page)).settings.picture).toBe('meaning')
  await page.evaluate(() => (location.hash = '/study'))
  await expect(page.locator('.flash-word')).toHaveText(cat[1])
  await page.waitForTimeout(400)
  await none(card(page))
})

test('dark mode: the picture on the dark card, both settings', async ({ page }) => {
  await study(page, CAT, { theme: 'dark', picture: 'always' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await loaded(page)
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.getByRole('img', { name: cat[3], exact: true })).toBeVisible()
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
  [390, 763], // 390×844 less an iPhone's safe areas (47 + 34)
  [375, 667],
] as const)
  test(`${width}×${height}: a card with its picture, the longest example and kanji chips fits without scrolling; the picture stays whole, 16:9; closed, it is a balanced card; no text changes size`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await study(page, TALL[0])
    await expect(page.locator('.flash-word')).toHaveText(TALL[1])
    await settled(page)
    await page.waitForTimeout(READ_MS)
    // closed (의미와 함께): no picture, the centre in the middle of its room
    await none(card(page))
    await centred(page)
    const closedType = await type(page)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await loaded(page)
    await expect(card(page).locator('.kanji-chip').first()).toBeVisible()
    await page.waitForTimeout(300)
    expect(await type(page)).toEqual(closedType)
    await page.screenshot({ path: test.info().outputPath(`${width}x${height}.png`) })
    const m = await card(page)
      .locator('.flash-scroll')
      .evaluate((s) => {
        const r = s.getBoundingClientRect()
        const parts = [...s.querySelectorAll('.word-pic, .flash-reading, .flash-word, .flash-meaning-slot, .example-ja, .example-ko, .kanji-row')].map((e) => e.getBoundingClientRect())
        return { overflow: s.scrollHeight - s.clientHeight, outside: parts.filter((p) => p.top < r.top - 0.5 || p.bottom > r.bottom + 0.5).length }
      })
    expect(m.overflow, 'the card does not scroll').toBeLessThanOrEqual(0)
    expect(m.outside, 'every part inside the card').toBe(0)
    // the picture is never cropped: where the card is short the whole picture is smaller, still 16:9 and centred,
    // never below 72px high; on the phone the mockups were drawn for it keeps (nearly) the card's full width
    const t = await box(page, '.word-pic')
    const img = await box(page, '.word-pic img')
    const body = await box(page, '.flash-body')
    expect(img).toEqual(t)
    expect(t.width / t.height).toBeCloseTo(16 / 9, 1)
    expect(Math.abs(t.width - (t.height * 16) / 9)).toBeLessThanOrEqual(1)
    expect(t.x + t.width / 2).toBeCloseTo(body.x + body.width / 2, 0)
    expect(t.height).toBeGreaterThanOrEqual(72 - 0.5)
    if (height >= 844) expect(t.width).toBeGreaterThan(body.width * 0.85)
    // the grades stay on screen
    for (const b of await page.locator('.answer-bar').getByRole('button').all()) expect((await b.boundingBox())!.y + (await b.boundingBox())!.height).toBeLessThanOrEqual(height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })

for (const [width, height] of [
  [390, 844],
  [375, 667],
] as const)
  test(`${width}×${height}, 항상: the closed card with its picture, the longest example and kanji chips fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await study(page, TALL[0], ALWAYS)
    await expect(page.locator('.flash-word')).toHaveText(TALL[1])
    await loaded(page)
    await settled(page)
    const closedType = await type(page)
    await page.waitForTimeout(READ_MS)
    const m = await card(page).locator('.flash-scroll').evaluate((s) => s.scrollHeight - s.clientHeight)
    expect(m).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(card(page).locator('.kanji-chip').first()).toBeVisible()
    await page.waitForTimeout(300)
    expect(await card(page).locator('.flash-scroll').evaluate((s) => s.scrollHeight - s.clientHeight)).toBeLessThanOrEqual(0)
    expect(await type(page)).toEqual(closedType)
  })
