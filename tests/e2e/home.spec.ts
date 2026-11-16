// Home (docs/design-system.md §3 "홈", boards 2-1 … 2-4): every state of the screen, in names and numbers only — Ruma's
// face follows the day (it says nothing), the 오늘 card holds the day's figures and the sessions (복습, 새 단어, 한자) as
// buttons with at most one primary, each button's number is what its session shows; the current chapter and the
// level's words and kanji below; at 320×568 the buttons are on the first screen without sideways scrolling; no
// accessibility violations in light and dark.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, axeViolations, homeShown, KEY, keyFor, NOW, open, todayLog, user } from './fixtures'

const DAY = 86400_000
const MIN = 60_000
const t = NOW.getTime()
const review = (due: number) => ({ due, stability: 20, difficulty: 5, elapsed_days: 20, scheduled_days: 20, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 20 * DAY })
const learning = (due: number) => ({ due, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 1, reps: 1, lapses: 0, state: 1, last_review: t - 5 * MIN })
/** N5 words 0..met-1 met; the first `due` of them due today (`overdue` days late) */
const cards = (met: number, due: number, overdue = 0) =>
  Object.fromEntries(Array.from({ length: met }, (_, i) => [`5-${i}`, review(i < due ? t - overdue * DAY - 60 * MIN + i * 1000 : t + (2 + (i % 30)) * DAY)]))
const days = (n: number, today?: Record<string, number>) => ({
  ...Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(t - (i + 1) * DAY).toLocaleDateString('sv'), { c: 100, n: 10, r: 90, p: 80, ms: 15 * MIN }])),
  ...(today ? { '2026-11-13': today } : {}),
})

/** `review` / `fresh`: the numbers on the 복습 and 새 단어 buttons (null: no such button in this state). `count` is
 * "done / all" of the 오늘 card, `time` the figure at its right (null: none). */
type Case = { state: unknown; mood: string; ruma: string; primary: number; review: string | null; fresh: string | null; count: string; time: RegExp | null }
const CASES: Record<string, Case> = {
  'before studying': { state: user({ dailyNew: 20 }, { cards: cards(300, 107), log: days(5) }), mood: 'sleep', ruma: 'sleep', primary: 1, review: '107장', fresh: '20', count: '0 / 127', time: /^\d+분$/ },
  'part-way': { state: user({ dailyNew: 20 }, { cards: cards(300, 40), log: days(5, { c: 60, n: 10, r: 50, p: 45, ms: 9 * MIN }) }), mood: 'wake', ruma: 'idle', primary: 1, review: '40장', fresh: '10', count: '60 / 110', time: /^\d+분$/ },
  'today’s share done': { state: user({ dailyNew: 0 }, { cards: cards(300, 0), log: days(5, { c: 90, n: 10, r: 80, p: 70, ms: 14 * MIN }) }), mood: 'day', ruma: 'cheer', primary: 0, review: null, fresh: null, count: '90 / 90', time: /^14분$/ },
  // more due than a day holds: "600장 중 225장", new words cut to 5
  'a backlog': { state: user({ dailyNew: 20 }, { cards: cards(700, 600, 7) }), mood: 'sleep', ruma: 'sleep', primary: 1, review: '600장 중225장', fresh: '5', count: '0 / 230', time: /^\d+분$/ },
  'waiting for learning cards': {
    state: user({ dailyNew: 0 }, { cards: { ...cards(100, 0), '5-200': learning(t + 40 * MIN), '5-201': learning(t + 45 * MIN) }, log: days(2, { c: 30, n: 0, r: 28, p: 26 }) }),
    // the two words still in their first steps are the new session's
    mood: 'wake', ruma: 'idle', primary: 1, review: null, fresh: '2', count: '30 / 32', time: /^40분 뒤$/,
  },
  'a day off with words left': { state: user({ dailyNew: 0 }, { cards: cards(100, 0), log: days(3) }), mood: 'sleep', ruma: 'sleep', primary: 1, review: null, fresh: null, count: '0 / 0', time: null },
  'every word of the level met': { state: user({ target: 5 }, { cards: cards(718, 0), log: days(3) }), mood: 'sleep', ruma: 'sleep', primary: 0, review: null, fresh: null, count: '0 / 0', time: null },
  // a new learner: the new words and the kanji, nothing studied yet
  'the first session': { state: { v: 4, onboarded: true, guide: { done: ['level', 'intro'] }, settings: { target: 3, dailyNew: 20, theme: 'light', autoSpeak: false, includeLower: true }, cards: {}, log: {}, marks: [], xp: 0 }, mood: 'sleep', ruma: 'sleep', primary: 1, review: null, fresh: '20', count: '0 / 25', time: /^\d+분$/ },
}

const withTheme = (state: unknown, theme: string) =>
  state && typeof state === 'object' ? { ...state, settings: { ...(state as { settings: object }).settings, theme } } : state

/** Ruma's state, drawn as before (asleep, one eye, both eyes); it says nothing. */
async function shown(page: Page, c: Pick<Case, 'mood' | 'ruma'>) {
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', c.mood)
  await expect(page.locator('.today-ruma .ruma')).toHaveClass(new RegExp(`\\b${c.ruma}\\b`))
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const reseed = (page: Page, state: unknown) =>
  page.evaluate(([v4, k, v]) => (localStorage.removeItem(v4), localStorage.setItem(k, v)), [KEY, keyFor(state), JSON.stringify(state)])

for (const [name, c] of Object.entries(CASES)) {
  test(`${name}: Ruma’s state, the day’s figures, the two sessions with at most one primary; names and numbers only; light and dark without violations`, async ({ page }) => {
    await open(page, { state: c.state })
    await shown(page, c)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(c.primary)
    // the two sessions: a button each when it has cards, its number what the session will show; the first is the primary
    const review = page.locator('.home-go.go-review')
    const fresh = page.locator('.home-go.go-new')
    await expect(review).toHaveCount(c.review ? 1 : 0)
    await expect(fresh).toHaveCount(c.fresh ? 1 : 0)
    if (c.review) {
      await expect(review).toHaveText(`복습${c.review}`)
      await expect(review).toHaveAttribute('data-variant', 'primary')
    }
    if (c.fresh) {
      await expect(fresh).toHaveText(`새 단어${c.fresh}개`)
      await expect(fresh).toHaveAttribute('data-variant', c.review ? 'secondary' : 'primary')
    }
    // the 오늘 card: "done / all" over one bar with a text alternative, the time at its right
    await expect(page.getByRole('progressbar', { name: '오늘 학습' })).toHaveCount(1)
    await expect(page.locator('.today-count')).toHaveText(c.count)
    await expect(page.locator('.plan-time')).toHaveCount(c.time ? 1 : 0)
    if (c.time) await expect(page.locator('.plan-time')).toHaveText(c.time)
    // nothing on Home is a sentence: every visible text is a name or a number (no mascot line, no helper)
    await expect(page.locator('.ruma-line, .home-go-sub, .c-learning')).toHaveCount(0)
    expect(await page.locator('main').innerText()).not.toMatch(/요[.?]?(\n|$)|니다/)
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(await ground()).toBe(rgb('#faf8f5'))
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(rgb('#faf8f5'))
    expect(await axeViolations(page)).toEqual([])
    // dark: the same state at night
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await shown(page, c)
    expect(await ground()).toBe(rgb('#1b1917'))
    expect(await axeViolations(page)).toEqual([])
  })

  test(`${name}: 320×568 without sideways scrolling, the buttons on the first screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await open(page, { state: withTheme(c.state, 'dark') })
    await shown(page, c)
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    const tabbar = (await page.locator('.tabbar').boundingBox())!.y
    // every button of the 오늘 card is above the tab bar without scrolling
    const buttons = await page.locator('.home-actions .btn').all()
    // (every word of the level met: nothing to offer)
    expect(buttons.length).toBeGreaterThan(name === 'every word of the level met' ? -1 : 0)
    for (const b of buttons) {
      const box = (await b.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(tabbar)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('the states without a session: “오늘 끝” and more new words, a day off, a level with every word met', async ({ page }) => {
  await open(page, { state: CASES['today’s share done'].state })
  await expect(page.locator('.home-done')).toHaveText('오늘 끝')
  const more = page.getByRole('button', { name: '새 단어 더 하기, 10개' })
  await expect(more).toHaveText('새 단어 더10개')
  await expect(more).toHaveAttribute('data-variant', 'secondary')
  // a day off: more new words is the one thing to do
  await reseed(page, CASES['a day off with words left'].state)
  await page.reload()
  await expect(page.locator('.home-done')).toHaveCount(0)
  await expect(more).toHaveAttribute('data-variant', 'primary')
  // every word of the level met: nothing offered (the level is changed in 설정)
  await reseed(page, CASES['every word of the level met'].state)
  await page.reload()
  await expect(page.locator('.home-actions .btn')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '준비하는 급수 N5' })).toBeVisible()
  await expect(page.getByRole('link', { name: /급수/ })).toHaveCount(0)
})

test('the buttons do not move between before, part-way and a backlog', async ({ page }) => {
  const ys: Record<string, number[]> = {}
  await open(page, { state: CASES['before studying'].state })
  for (const name of ['before studying', 'part-way', 'a backlog']) {
    // the next saved state, as the app would find it at launch
    await reseed(page, CASES[name].state)
    await page.reload()
    await shown(page, CASES[name])
    ys[name] = [Math.round((await page.locator('.home-go.go-review').boundingBox())!.y), Math.round((await page.locator('.home-go.go-new').boundingBox())!.y)]
  }
  expect(ys['part-way']).toEqual(ys['before studying'])
  // the backlog changes the review button's figure only ("600장 중 225장"): the buttons stay where they are
  expect(ys['a backlog']).toEqual(ys['before studying'])
})

test('the current chapter: its number, the words met, the next words; the line under it: the level’s words and kanji met', async ({ page }) => {
  // 60 N5 words met in their order: chapter 1 done, chapter 2 has 10
  const order = JSON.parse(readFileSync(new URL('../../public/data/words-n5.json', import.meta.url), 'utf8')) as [string, string, string, string, string, number][]
  const ids = [...order].sort((a, b) => a[5] - b[5]).map((r) => r[0])
  const state = { ...user({}, { kanji: false }), v: 4, cards: Object.fromEntries(ids.slice(0, 60).map((id) => [id, review(t + 5 * DAY)])) }
  await open(page, { state })
  await homeShown(page)
  await expect(page.getByRole('heading', { name: '지금 챕터', level: 2 })).toBeVisible()
  const chapter = page.getByRole('link', { name: 'N5 챕터 2, 50단어 중 10 만남' })
  await expect(chapter.locator('.chapter-name')).toHaveText('챕터 2')
  await expect(chapter.locator('.chapter-count')).toHaveText('10 / 50')
  await expect(chapter.locator('.word-chip')).toHaveCount(4)
  await expect(page.locator('.home-foot')).toHaveText(/N5 단어 60 \/ 718\s*·\s*한자 0 \/ 450/)
  // the bar is in ink
  expect(await chapter.locator('.bar > i').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb('#2d2a26'))
  await chapter.click()
  await expect(page).toHaveURL(/#\/level\/5\/2$/)
  await expect(page.getByRole('heading', { name: /챕터 2/, level: 1 })).toBeVisible()
  await page.goBack()
  await page.getByRole('link', { name: /모든 챕터/ }).click()
  await expect(page).toHaveURL(/#\/level\/5$/)
})

test('복습하기 opens a session of the reviews only, 새 단어 one of the new words only; each button’s number is its session’s', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 3 }, { cards: cards(40, 4) }) })
  await homeShown(page)
  await expect(page.locator('.go-review .home-go-count')).toHaveText('4장')
  await expect(page.locator('.go-new .home-go-count')).toHaveText('3개')
  // the reviews: four cards, none of them new; the new words are untouched
  await page.getByRole('button', { name: '복습 시작, 4장' }).click()
  await expect(page).toHaveURL(/#\/study\/review$/)
  await expect(page.locator('.left-count')).toHaveAttribute('data-left', '4')
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('.flash-meta')).not.toContainText('새 단어')
    await answer(page, '알아요')
  }
  // the session is over while the day is not: it says what is left and goes home
  await expect(page.getByRole('heading', { name: '복습 끝', level: 1 })).toBeVisible()
  await expect(page.locator('.done-text')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '새 단어 시작, 3개' })).toHaveText('새 단어3개')
  await expect(page.getByRole('button', { name: /새 단어.*더 하기/ })).toHaveCount(0)
  expect(await todayLog(page)).toMatchObject({ c: 4, n: 0, r: 4 })
  await page.getByRole('button', { name: '홈으로' }).click()
  await homeShown(page)
  await expect(page.locator('.home-go.go-review')).toHaveCount(0)
  // the new words are now the one primary
  const fresh = page.getByRole('button', { name: '새 단어 시작, 3개' })
  await expect(fresh).toHaveAttribute('data-variant', 'primary')
  await fresh.click()
  await expect(page).toHaveURL(/#\/study\/new$/)
  await expect(page.locator('.left-count')).toHaveAttribute('data-left', '3')
  await expect(page.locator('.flash-meta')).toContainText('새 단어')
  await answer(page, '쉬워요')
  expect(await todayLog(page)).toMatchObject({ c: 5, n: 1, r: 4 })
  // leaving part-way: Home counts what the session still holds
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page.getByRole('button', { name: '새 단어 이어서 하기, 2개 남음' })).toBeVisible()
  await expect(page.locator('.today-count')).toHaveText('5 / 7')
})

test('a word forgotten in the new session stays there; a review forgotten stays with the reviews', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 1 }, { cards: cards(40, 1) }) })
  await homeShown(page)
  await page.getByRole('button', { name: '새 단어 시작, 1개' }).click()
  await answer(page, '모르겠어요')
  await page.getByRole('button', { name: /나가기/ }).click()
  // the word is in its first steps: still the new session's (said in the button's name), not a review
  const fresh = page.getByRole('button', { name: '새 단어 이어서 하기, 1개 남음, 익히는 중 1개 포함' })
  await expect(fresh).toHaveText('새 단어1개')
  await expect(page.locator('.go-review .home-go-count')).toHaveText('1장')
  await page.getByRole('button', { name: '복습 시작, 1장' }).click()
  await answer(page, '모르겠어요')
  await page.getByRole('button', { name: /나가기/ }).click()
  // the forgotten review comes back within minutes: it waits in the review session
  await expect(page.locator('.go-review .home-go-count')).toHaveText('1장')
  await expect(page.locator('.go-new .home-go-count')).toHaveText('1개')
})

test('the tab bar is a white surface with a hairline on top; the tab you are on has its icon filled pink; 기록 is the bar-rect icon', async ({ page }) => {
  await open(page, { state: user({ target: 4, includeLower: true }, { cards: cards(718, 0) }) })
  await homeShown(page)
  const tabbar = page.locator('.tabbar')
  for (const [tab, heading] of [['홈', '오늘'], ['단어장', '단어장'], ['기록', '기록'], ['설정', '설정']]) {
    await tabbar.getByRole('link', { name: tab }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    const css = await tabbar.evaluate((el) => {
      const cs = getComputedStyle(el)
      return [cs.backgroundColor, cs.borderTopWidth, cs.borderTopLeftRadius]
    })
    expect(css).toEqual(['rgb(255, 255, 255)', '1px', '0px'])
    const on = tabbar.locator('a[aria-current="page"]')
    await expect(on).toHaveText(tab)
    expect(await on.locator('svg').evaluate((el) => getComputedStyle(el).fill)).toBe(rgb('#f7c6d0'))
    expect(await on.locator('svg').evaluate((el) => getComputedStyle(el).stroke)).toBe(rgb('#6b665d'))
    expect(await on.evaluate((el) => getComputedStyle(el).color)).toBe(rgb('#2d2a26'))
    expect(await tabbar.locator('a:not([aria-current]) svg').first().evaluate((el) => getComputedStyle(el).fill)).toBe('none')
  }
  await expect(tabbar.getByRole('link', { name: '기록' }).locator('svg rect')).toHaveCount(3)
})
