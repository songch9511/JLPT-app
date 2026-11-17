// The final design's new screens and behaviour (2026-11-16): the kanji study card (boards 4-1 … 4-4), the word card's
// kanji chips (3-2 … 3-4), the ends of a chapter (3-9) and of a level (3-10), and the dark palette applied app-wide
// (7-1, 7-2).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { answer, axeViolations, homeShown, NOW, open, READ_MS, saved, todayLog, user } from './fixtures'

const DAY = 86_400_000
const t = NOW.getTime()
const review = (due: number, extra: Record<string, number> = {}) => ({ due, stability: 30, difficulty: 5, elapsed_days: 25, scheduled_days: 25, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 25 * DAY, ...extra })
type Row = [string, string, string, string, string, number]
const order = (l: number) => (JSON.parse(readFileSync(new URL(`../../public/data/words-n${l}.json`, import.meta.url), 'utf8')) as Row[]).sort((a, b) => a[5] - b[5])
const KANJI = JSON.parse(readFileSync(new URL('../../public/data/kanji.json', import.meta.url), 'utf8')) as [string, number, string, string, string, string, string, string[]][]
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

test.describe('kanji study (4-1 … 4-4)', () => {
  test('home’s 한자 button opens the day’s kanji; the card: the kanji alone, then 훈음 (의미), its readings (히라가나), its words three at a time', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0, dailyKanji: 3 }, { kanji: false }) })
    await homeShown(page)
    const kanji = page.getByRole('button', { name: /^한자 시작, 3자/ })
    await expect(kanji).toHaveText('한자3자')
    await kanji.click()
    await expect(page).toHaveURL(/#\/study\/kanji$/)
    const card = page.locator('.flash.kanji-card')
    await expect(card).toBeVisible()
    const first = KANJI[0]
    await expect(card.locator('.flash-kanji')).toHaveText(first[0])
    await expect(card.locator('.flash-meta')).toHaveText('새 한자')
    await expect(card.locator('.flash-head .level-badge')).toHaveText('N5')
    // a bookmark
    await expect(card.getByRole('button', { name: '북마크' })).toBeVisible()
    // closed: the words are listed, without their readings or meanings
    await expect(card.locator('.kanji-words-head')).toContainText(`단어 ${first[7].length}`)
    await expect(card.locator('.kanji-word')).toHaveCount(Math.min(3, first[7].length))
    await expect(card.locator('.flash-meaning')).not.toBeVisible()
    await expect(card.locator('.kanji-yomi')).not.toBeVisible()
    await expect(card.locator('.kw-reading').first()).not.toBeVisible()
    await expect(card.locator('.kw-meaning').first()).not.toBeVisible()
    const at = (await card.locator('.flash-kanji').boundingBox())!
    // 의미: the 훈음 and the words' meanings
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await expect(card.locator('.flash-meaning')).toHaveText(first[2] ? `${first[2]} ${first[3]}` : first[3])
    await expect(card.locator('.kw-meaning').first()).toBeVisible()
    await expect(card.locator('.kanji-yomi')).not.toBeVisible()
    // 히라가나: the on readings in hiragana, the kun readings with their okurigana, the words' readings
    await page.getByRole('button', { name: '히라가나', exact: true }).click()
    await expect(card.locator('.kanji-yomi')).toBeVisible()
    await expect(card.locator('.yomi-label')).toHaveText(['음독', '훈독'].slice(0, await card.locator('.yomi-label').count()))
    await expect(card.locator('.kw-reading').first()).toBeVisible()
    // nothing moved
    expect((await card.locator('.flash-kanji').boundingBox())!.y).toBe(at.y)
    // the words, a page at a time
    if (first[7].length > 3) {
      await expect(card.locator('.pager')).toContainText(`1 / ${Math.ceil(first[7].length / 3)}`)
      await card.getByRole('button', { name: '다음 단어' }).click()
      await expect(card.locator('.pager')).toContainText(`2 / ${Math.ceil(first[7].length / 3)}`)
    }
    expect(await todayLog(page)).toBeUndefined()
    // the three grades; kanji answers keep their own counts
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^알아요/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    expect(await todayLog(page)).toMatchObject({ c: 1, n: 0, kn: 1 })
    expect((await saved(page)).cards[`k${first[0]}`]).toBeDefined()
    expect(await axeViolations(page)).toEqual([])
  })

  test('the daily new kanji follow 설정 › 하루 새 한자 (3 · 5 · 10 · 15)', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }, { kanji: false }), hash: '/settings' })
    const daily = page.getByRole('radiogroup', { name: '하루 새 한자' })
    await expect(daily.getByRole('radio')).toHaveText(['3', '5', '10', '15'])
    await expect(daily.getByRole('radio', { name: '5', exact: true })).toHaveAttribute('aria-checked', 'true')
    await daily.getByRole('radio', { name: '15' }).click()
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.locator('.go-kanji .home-go-count')).toHaveText('15자')
    expect((await saved(page)).settings.dailyKanji).toBe(15)
  })
})

test.describe('the word card (3-1 … 3-4)', () => {
  test('a kanji word’s chips: the kanji, its 음 with 의미, its reading in this word with 히라가나; none on a kana word', async ({ page }) => {
    const words = order(5)
    const i = words.findIndex((w) => w[1] === '学校')
    await open(page, { state: { ...user({ dailyNew: 1 }), v: 4, cards: Object.fromEntries(words.slice(0, i).map((w) => [w[0], review(t + 20 * DAY)])) }, hash: '/study' })
    await expect(page.locator('.flash-word')).toHaveText('学校')
    const chips = page.locator('.kanji-chip')
    await expect(chips).toHaveCount(2)
    await expect(page.locator('.kanji-row')).not.toBeVisible()
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await expect(chips.locator('.kanji-ko')).toHaveText(['학', '교'])
    await expect(chips.locator('.kanji-ja').first()).not.toBeVisible()
    await page.getByRole('button', { name: '히라가나', exact: true }).click()
    await expect(chips.locator('.kanji-ja')).toHaveText(['がっ', 'こう'])
  })
})

test.describe('the ends of a chapter and of a level (3-9, 3-10)', () => {
  test('the session that meets a chapter’s last word ends with its 済 seal and the level’s chapters done', async ({ page }) => {
    const ids = order(5).map((w) => w[0])
    await open(page, { state: { ...user({ dailyNew: 1 }), v: 4, cards: { ...user().cards, ...Object.fromEntries(ids.slice(0, 49).map((id) => [id, review(t + 20 * DAY)])) } }, hash: '/study/new' })
    await answer(page, '쉬워요')
    await expect(page.getByRole('heading', { name: '챕터 1 끝', level: 1 })).toBeVisible()
    await expect(page.locator('.done-body .seal')).toHaveText('済')
    await expect(page.locator('.done-figures dt')).toHaveText(['N5 챕터', '연속', '오늘 XP'])
    await expect(page.locator('.done-figures dd').first()).toHaveText('1 / 15')
    await expect(page.getByRole('button', { name: '홈으로' })).toHaveAttribute('data-variant', 'primary')
    await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toHaveText('새 단어 더10개')
  })

  test('the session that meets the level’s last word ends with “N5 끝”: its words, its kanji, the days it took; the next level starts from there', async ({ page }) => {
    const ids = order(5).map((w) => w[0])
    const log = { '2026-10-01': { c: 30, n: 10, r: 20, p: 18 } }
    await open(page, { state: { ...user({ dailyNew: 1 }), v: 4, log, cards: { ...user().cards, ...Object.fromEntries(ids.slice(0, 717).map((id) => [id, review(t + 20 * DAY)])) } }, hash: '/study/new' })
    await answer(page, '쉬워요')
    await expect(page.getByRole('heading', { name: 'N5 끝', level: 1 })).toBeVisible()
    await expect(page.locator('.done-body .seal')).toHaveText('済')
    await expect(page.locator('.done-figures dd')).toHaveText(['718', '450', '44일'])
    await expect(page.locator('.done-figures dt')).toHaveText(['단어', '한자', '걸린 날'])
    await expect(page.getByRole('button', { name: 'N5 복습 계속' })).toHaveAttribute('data-variant', 'secondary')
    await page.getByRole('button', { name: 'N4 시작하기' }).click()
    await homeShown(page)
    await expect(page.getByRole('img', { name: '준비하는 급수 N4' })).toBeVisible()
    expect((await saved(page)).settings.target).toBe(4)
  })
})

test.describe('dark (7-1, 7-2): the whole app when 설정 › 테마 is 다크, or 시스템 with a dark OS', () => {
  for (const how of ['setting', 'system'] as const)
    test(`${how}: home and the study card in the dark palette`, async ({ page }) => {
      if (how === 'system') await page.emulateMedia({ colorScheme: 'dark' })
      await open(page, { state: user({ theme: how === 'setting' ? 'dark' : 'system', dailyNew: 5 }) })
      await homeShown(page)
      const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(await bg('body')).toBe(rgb('#1b1917'))
      expect(await bg('.today')).toBe(rgb('#25221f'))
      expect(await bg('.tabbar')).toBe(rgb('#25221f'))
      expect(await bg('.btn[data-variant="primary"]')).toBe(rgb('#f1ede5'))
      expect(await page.locator('.home-head .level-badge').evaluate((el) => getComputedStyle(el).color)).toBe(rgb('#c6e0ae'))
      expect(await axeViolations(page)).toEqual([])
      await page.getByRole('button', { name: /^새 단어 시작/ }).click()
      await expect(page.locator('.flash')).toBeVisible()
      expect(await bg('.flash')).toBe(rgb('#25221f'))
      expect(await page.locator('.flash-word').evaluate((el) => getComputedStyle(el).color)).toBe(rgb('#f1ede5'))
      await page.keyboard.press('Space')
      expect(await bg('.btn.toggle[aria-pressed="true"]')).toBe(rgb('#36322c'))
      expect(await axeViolations(page)).toEqual([])
    })
})
