// The first run (src/guide.ts, src/screens/LevelPicker.tsx): no onboarding page and no explanations. A new learner is
// shown the five levels as cards (the level in its colour and its word count) under "준비하는 급수", with the
// unofficial line; choosing one lands on Home with the first session. Home's level chip opens the same picker to
// change the target level. Ruma's one-time tips are gone; learners from before the first run see none of it. (Until
// 2026-11-14 the exam date was asked after the level; that step is gone.)
import { expect, test } from '@playwright/test'
import { answer, homeShown, KEY, open, saved, user } from './fixtures'

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
/** Each level's badge, [tint, ink], light and dark (rumaTheme.ts). */
const LEVEL_COLOURS: Record<number, { light: [string, string]; dark: [string, string] }> = {
  5: { light: ['#e8f1dc', '#3f6426'], dark: ['#26321c', '#b5d39b'] },
  4: { light: ['#fbf1c9', '#6e5210'], dark: ['#332b12', '#e6cf7a'] },
  3: { light: ['#fce8ed', '#8f3550'], dark: ['#3a2229', '#f0b3c1'] },
  2: { light: ['#ebe6f7', '#56428f'], dark: ['#2c2640', '#c9bcef'] },
  1: { light: ['#e1edf6', '#2c5f85'], dark: ['#1d2d3a', '#a9cdea'] },
}

test('a new learner: five level cards, then Home with the first session; no tips anywhere', async ({ page }) => {
  await open(page)
  // the launch screen goes as soon as the app is drawn
  await expect(page.locator('#launch')).toHaveCount(0)
  // the app's name, the question as a heading, five cards: the level and its real word count, nothing else
  await expect(page.getByRole('heading', { name: 'JLPT 루마', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '준비하는 급수' })).toBeVisible()
  const levels = page.getByRole('group', { name: '준비하는 급수' })
  await expect(levels.getByRole('button')).toHaveText(['N5718단어', 'N4668단어', 'N32,140단어', 'N21,905단어', 'N12,699단어'])
  await expect(levels.getByRole('button', { name: 'N3, 2,140단어' })).toBeVisible()
  await expect(page.locator('.first-note')).toHaveText('JF·JEES와 무관한 비공식 앱')
  // nothing that looks like a result, no mascot, no sentence, no primary
  await expect(page.locator('.home-go, .today, .streak, .ruma')).toHaveCount(0)
  await expect(page.getByText(/반가워요|어느 급수를|쉬움|어려움/)).toHaveCount(0)
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(0)
  await levels.getByRole('button', { name: 'N3, 2,140단어' }).click()

  // the answer is saved at once and completes the plan: Home with the first session, one primary; focus on the day
  await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeFocused()
  await expect(page.getByRole('link', { name: '급수 N3, 바꾸기' })).toHaveText('N3')
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'sleep')
  await expect(page.locator('.today-count')).toHaveText('0 / 20장')
  await expect(page.locator('.plan .c-new b')).toHaveText('20')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  // no streak before anything was studied
  await expect(page.locator('.streak')).toHaveCount(0)
  await expect(page.getByText(/시험|D-\d|아직 몰라요|깨워 줄래요/)).toHaveCount(0)
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 3, dailyNew: 20, includeLower: true }, guide: { done: ['level'] } })
  expect(s.settings).not.toHaveProperty('examDate')
  await page.getByRole('button', { name: '첫 학습 시작, 새 단어 20개' }).click()

  // reading cards come with no tip
  let readingCards = 0
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.flash')).toBeVisible()
    readingCards += await page.locator('.reading-card').count()
    await expect(page.locator('.study-tip, .bubble')).toHaveCount(0)
    await answer(page, '알아요')
  }
  expect(readingCards).toBeGreaterThan(0)
  expect((await saved(page)).guide.done).toEqual(['level'])

  // back home: the first session is over, and Ruma explains nothing
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page.getByRole('button', { name: /^새 단어 이어서 하기, \d+개 남음/ })).toBeVisible()
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'wake')
  await expect(page.getByText(/잊을 때쯤|한쪽 눈 떴어요|알겠어요/)).toHaveCount(0)
  await page.reload()
  await homeShown(page)
  await expect(page.getByText(/잊을 때쯤/)).toHaveCount(0)
})

for (const theme of ['light', 'dark'] as const)
  test(`${theme}: the level cards and Home’s chip carry each level’s colour; the name is always written`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await open(page)
    for (const l of [5, 4, 3, 2, 1]) {
      const badge = page.getByRole('button', { name: new RegExp(`^N${l}, `) }).locator('.level-badge')
      await expect(badge).toHaveText(`N${l}`)
      const [bg, ink] = await badge.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
      expect([bg, ink]).toEqual(LEVEL_COLOURS[l][theme].map(rgb))
    }
    await page.getByRole('button', { name: /^N2, / }).click()
    const chip = page.getByRole('link', { name: '급수 N2, 바꾸기' })
    await expect(chip).toHaveText('N2')
    expect(await chip.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(LEVEL_COLOURS[2][theme].map(rgb))
  })

test('Home’s level chip opens the same picker to change the target level, as 설정 › 목표 급수 does', async ({ page }) => {
  await open(page, { state: user({ target: 5, dailyNew: 10 }) })
  await homeShown(page)
  await page.getByRole('link', { name: '급수 N5, 바꾸기' }).click()
  await expect(page).toHaveURL(/#\/level$/)
  const levels = page.getByRole('group', { name: '준비하는 급수' })
  await expect(levels.getByRole('button')).toHaveCount(5)
  // the level now chosen is marked (a check, and aria-current), never by colour alone
  await expect(levels.getByRole('button', { name: 'N5, 718단어' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.first-note')).toHaveCount(0)
  // back without changing anything
  await page.getByRole('link', { name: '홈으로' }).click()
  await homeShown(page)
  expect((await saved(page)).settings.target).toBe(5)
  // choosing another level changes the target and goes home
  await page.getByRole('link', { name: '급수 N5, 바꾸기' }).click()
  await page.getByRole('button', { name: 'N3, 2,140단어' }).click()
  await homeShown(page)
  await expect(page.getByRole('link', { name: '급수 N3, 바꾸기' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'N3 단어', level: 2 })).toBeVisible()
  expect((await saved(page)).settings.target).toBe(3)
  // 설정 › 목표 급수 says the same
  await page.getByRole('link', { name: '설정' }).click()
  await expect(page.getByRole('radio', { name: 'N3' })).toHaveAttribute('aria-checked', 'true')
})

test('a learner saved at the removed exam-date question lands on the first session, with the level they chose', async ({ page }) => {
  // as the version with that question saved it: level answered, not onboarded yet, the default exam date set
  const state = { v: 4, onboarded: false, settings: { target: 2, examDate: '2026-12-06', dailyNew: 20, theme: 'light', autoSpeak: false, includeLower: true, goal: 0.8, fastTrack: true }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: ['level'] } }
  await open(page, { state })
  await expect(page.getByRole('link', { name: '급수 N2, 바꾸기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
  await expect(page.getByText(/시험|아직 몰라요/)).toHaveCount(0)
  await page.getByRole('button', { name: '첫 학습 시작' }).click()
  await expect(page).toHaveURL(/#\/study\/new$/)
  // the next save writes the state as it is now: onboarded, without the exam date
  await answer(page, '알아요')
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 2 }, guide: { done: ['level'] } })
  expect(s.settings).not.toHaveProperty('examDate')
})

test('one who had answered the retired steps or seen the retired tips is where they were; those ids are dropped', async ({ page }) => {
  const state = { ...user({ fastTrack: true, examDate: '2027-07-04' }), v: 4, log: { '2026-11-10': { c: 40, n: 10, r: 32, p: 28 } }, guide: { done: ['level', 'exam', 'exam-unknown', 'srs', 'reading', 'ready'] } }
  await open(page, { state })
  await homeShown(page)
  await expect(page.getByText(/시험|잊을 때쯤/)).toHaveCount(0)
  await page.getByRole('button', { name: '새 단어 시작' }).click()
  await answer(page, '알아요')
  expect((await saved(page)).guide).toEqual({ done: ['level'] })
})

test('a reload continues where it was; before the level is chosen the study route shows the level cards', async ({ page }) => {
  await open(page)
  await page.goto('./#/study')
  await expect(page.getByRole('group', { name: '준비하는 급수' })).toBeVisible()
  await page.goto('./#/')
  await page.getByRole('button', { name: /^N2, / }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
  await expect(page.getByRole('link', { name: '급수 N2, 바꾸기' })).toBeVisible()
})

test('works with the keyboard alone', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /^N5, / }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter') // N4
  await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/study\/new$/)
})

test('an existing learner sees nothing of the first run: no question, no tips, also with reading cards', async ({ page }) => {
  await open(page, { state: user({ fastTrack: true, dailyNew: 20 }) })
  await homeShown(page)
  await expect(page.getByRole('group', { name: '준비하는 급수' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '새 단어 시작' })).toBeVisible()
  await page.getByRole('button', { name: '새 단어 시작' }).click()
  let readingCards = 0
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.flash')).toBeVisible()
    readingCards += await page.locator('.reading-card').count()
    await expect(page.locator('.study-tip, .bubble')).toHaveCount(0)
    await answer(page, '알아요')
  }
  expect(readingCards).toBeGreaterThan(0)
  await page.getByRole('button', { name: /나가기/ }).click()
  await homeShown(page)
  expect((await saved(page)).guide).toBeUndefined()
})

test('restoring an existing learner’s backup during the first run ends it, with no prompts', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /^N3, / }).click()
  await page.getByRole('link', { name: '설정' }).click()
  // the tips are gone, and with them their replay
  await expect(page.getByRole('button', { name: '루마의 안내 다시 보기' })).toHaveCount(0)
  const backup = { format: 'jlpt-luma-backup', formatVersion: 3, ...user({ target: 2 }, { log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }), v: 4 }
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' }).getByRole('button', { name: '백업으로 바꾸기' }).click()
  await page.getByRole('link', { name: '홈' }).click()
  await homeShown(page)
  await expect(page.getByRole('link', { name: '급수 N2, 바꾸기' })).toBeVisible()
  await expect(page.getByRole('button', { name: /첫 학습 시작/ })).toHaveCount(0)
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).guide, KEY)).toBeUndefined()
})

test('320px and the largest text sizes: the level cards and the first session do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page)
  await expect(page.getByRole('button', { name: /^N5, / })).toBeVisible()
  for (const large of [false, true]) {
    if (large)
      await page.evaluate(() => {
        const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
        for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
      })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    // every card is at least a 44px target, its name and count on one line inside it
    for (const b of await page.getByRole('group', { name: '준비하는 급수' }).getByRole('button').all()) {
      const box = (await b.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width).toBeLessThanOrEqual(320)
    }
  }
  await page.getByRole('button', { name: /^N1, / }).click()
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
