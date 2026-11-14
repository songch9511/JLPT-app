// Ruma's first run on home (src/guide.ts, src/screens/HomeGuide.tsx): no onboarding page; Ruma asks the level in the
// sky and the answers are the sheet's buttons, then the first session is offered; the tips come once each, in context; learners from before it see
// none of it. (Until 2026-11-14 the exam date was asked after the level; that step is gone.)
import { expect, test } from '@playwright/test'
import { answer, homeShown, KEY, open, saved, user } from './fixtures'

test('a new learner lands on home: level, then the first session; the tips appear once', async ({ page }) => {
  await open(page)
  // the launch screen goes as soon as the app is drawn
  await expect(page.locator('#launch')).toHaveCount(0)
  // nothing that looks like a result before the level is chosen
  await expect(page.getByRole('heading', { name: 'JLPT 루마', level: 1 })).toBeVisible()
  await expect(page.locator('.plan-counts')).toHaveCount(0)
  await expect(page.locator('.home-words')).toHaveCount(0)
  await expect(page.locator('.streak')).toHaveCount(0)
  // Ruma says hello and asks, asleep in the plain sky; the legal line is small at the foot
  await expect(page.locator('.ruma-line')).toHaveText('반가워요, 루마예요어느 급수를 준비해요?')
  await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', 'rest')
  await expect(page.locator('.first-note')).toHaveText('JF·JEES와 무관한 비공식 앱')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(0)
  const level = page.getByRole('group', { name: /어느 급수를 준비해요\?/ })
  await expect(level.getByRole('button')).toHaveText(['N5', 'N4', 'N3', 'N2', 'N1'])
  await level.getByRole('button', { name: 'N3' }).click()

  // the answer is saved at once and completes the plan: the first session, one primary; focus moves to Ruma's line
  const line = page.locator('.ruma-line')
  await expect(line).toBeFocused()
  await expect(line).toHaveText('깨워 줄래요?')
  await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', 'sleep')
  await expect(page.locator('.big')).toHaveText('20장')
  await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeVisible()
  await expect(page.locator('.home-head .subtitle')).toHaveText('11월 13일 금요일 · N3')
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('20')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '급수 다시 고르기' })).toBeVisible()
  // nothing about an exam, anywhere in the conversation
  await expect(page.getByText(/시험|D-\d|아직 몰라요/)).toHaveCount(0)
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 3, dailyNew: 20, includeLower: true }, guide: { done: ['level'] } })
  expect(s.settings).not.toHaveProperty('examDate')
  await page.getByRole('button', { name: '첫 학습 시작, 새 단어 20개' }).click()

  // the first reading card: Ruma says what it is, with that card only
  let tipSeen = 0
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.flash')).toBeVisible()
    if ((await page.locator('.reading-card').count()) && !tipSeen) {
      await expect(page.locator('.study-tip')).toContainText('한국어와 뜻이 같은 한자어는 읽기만 골라요.')
      tipSeen++
    } else {
      // only with the first reading card
      await page.waitForTimeout(300)
      await expect(page.locator('.study-tip')).toHaveCount(0)
    }
    await answer(page, '알아요')
  }
  expect(tipSeen).toBe(1)
  expect((await saved(page)).guide.done).toContain('reading')

  // back home: the first-run card is gone, and Ruma explains spaced repetition in its usual place, once
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page.getByRole('button', { name: '급수 다시 고르기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '이어서 하기' })).toHaveText('계속하기')
  await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', 'wake')
  const tip = page.locator('.home-sky .ruma-line.tip')
  await expect(tip).toContainText('본 단어는 잊을 때쯤 돌아와요. 기억할수록 간격이 길어져요.')
  await expect(page.getByRole('status').filter({ hasText: '루마: 본 단어는' })).toHaveCount(1)
  await page.getByRole('button', { name: '알겠어요' }).click()
  await expect(tip).toHaveCount(0)
  await expect(page.locator('.ruma-line')).toHaveText('한쪽 눈 떴어요')
  // never again, not even after a reload
  await page.reload()
  await homeShown(page)
  await expect(page.locator('.ruma-line.tip')).toHaveCount(0)
})

test('a learner saved at the removed exam-date question lands on the first session, with the level they chose', async ({ page }) => {
  // as the version with that question saved it: level answered, not onboarded yet, the default exam date set
  const state = { v: 4, onboarded: false, settings: { target: 2, examDate: '2026-12-06', dailyNew: 20, theme: 'light', autoSpeak: false, includeLower: true, goal: 0.8, fastTrack: true }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: ['level'] } }
  await open(page, { state })
  await expect(page.locator('.ruma-line')).toHaveText('깨워 줄래요?')
  await expect(page.locator('.home-head .subtitle b')).toHaveText('N2')
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
  await expect(page.getByText(/시험|아직 몰라요/)).toHaveCount(0)
  await page.getByRole('button', { name: '첫 학습 시작' }).click()
  await expect(page).toHaveURL(/#\/study$/)
  // the next save writes the state as it is now: onboarded, without the exam date
  await answer(page, '알아요')
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 2 }, guide: { done: ['level'] } })
  expect(s.settings).not.toHaveProperty('examDate')
})

test('one who had answered it, or the readiness tip, is where they were; the retired steps are dropped', async ({ page }) => {
  const state = { ...user({ fastTrack: true, examDate: '2027-07-04' }), v: 4, log: { '2026-11-10': { c: 40, n: 10, r: 32, p: 28 } }, guide: { done: ['level', 'exam', 'exam-unknown', 'srs', 'reading', 'ready'] } }
  await open(page, { state })
  await homeShown(page)
  await expect(page.locator('.ruma-line.tip')).toHaveCount(0)
  await expect(page.locator('.ruma-line')).toHaveText(/^(깨워 줄래요\?|자고 있어요)$/)
  await expect(page.getByText(/시험/)).toHaveCount(0)
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await answer(page, '알아요')
  expect((await saved(page)).guide).toEqual({ done: ['level', 'srs', 'reading'] })
})

test('a reload continues where it was; “급수 다시 고르기” goes back', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N2' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
  await expect(page.locator('.home-head .subtitle b')).toHaveText('N2')
  await page.getByRole('button', { name: '급수 다시 고르기' }).click()
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
  // before the question is answered there is nothing to study: the study route shows home
  await page.goto('./#/study')
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
})

test('works with the keyboard alone', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N5' }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter') // N4
  await expect(page.locator('.ruma-line')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/study$/)
})

test('an existing learner sees nothing of the first run: no questions, no tips, also with reading cards', async ({ page }) => {
  await open(page, { state: user({ fastTrack: true, dailyNew: 20 }) })
  await homeShown(page)
  await expect(page.getByRole('button', { name: '급수 다시 고르기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '오늘의 학습 시작' })).toBeVisible()
  await expect(page.locator('.ruma-line')).toHaveText(/^(깨워 줄래요\?|자고 있어요)$/)
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  let readingCards = 0
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.flash')).toBeVisible()
    readingCards += await page.locator('.reading-card').count()
    await page.waitForTimeout(300)
    await expect(page.locator('.study-tip')).toHaveCount(0)
    await answer(page, '알아요')
  }
  expect(readingCards).toBeGreaterThan(0)
  await page.getByRole('button', { name: /나가기/ }).click()
  await homeShown(page)
  await expect(page.locator('.ruma-line.tip')).toHaveCount(0)
  expect((await saved(page)).guide).toBeUndefined()
})

test('restoring an existing learner’s backup during the first run ends it, with no prompts', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N3' }).click()
  await page.getByRole('link', { name: '설정' }).click()
  const backup = { format: 'jlpt-luma-backup', formatVersion: 3, ...user({ target: 2 }, { log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }), v: 4 }
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' }).getByRole('button', { name: '백업으로 바꾸기' }).click()
  await page.getByRole('link', { name: '홈' }).click()
  await homeShown(page)
  await expect(page.locator('.home-head .subtitle b')).toHaveText('N2')
  await expect(page.getByRole('button', { name: '급수 다시 고르기' })).toHaveCount(0)
  await expect(page.locator('.ruma-line.tip')).toHaveCount(0)
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).guide, KEY)).toBeUndefined()
})

test('settings: “루마의 안내 다시 보기” brings the tips back', async ({ page }) => {
  await open(page, { state: user({}, { log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }), hash: '/settings' })
  await page.getByRole('button', { name: '루마의 안내 다시 보기' }).click()
  await expect(page.getByRole('status').filter({ hasText: '루마의 안내를 다시 켰어요.' })).toBeVisible()
  await page.getByRole('link', { name: '홈' }).click()
  await expect(page.locator('.ruma-line.tip')).toContainText('잊을 때쯤 돌아와요')
})

test('320px and the largest text sizes: the question and the first session do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await open(page)
  await expect(page.getByRole('button', { name: 'N5' })).toBeVisible()
  await page.evaluate(() => {
    const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
    for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
  })
  for (const next of ['N1', null]) {
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    if (next) await page.getByRole('button', { name: next }).click()
  }
})
