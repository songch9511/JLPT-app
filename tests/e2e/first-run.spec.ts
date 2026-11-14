// Ruma's first run on home (src/guide.ts, src/screens/HomeGuide.tsx): no onboarding page; the level and exam date are
// asked in the mascot card; the tips come once each, in context; learners from before it see none of it.
import { expect, test } from '@playwright/test'
import { answer, homeShown, KEY, open, saved, user } from './fixtures'

test('a new learner lands on home: level, then exam date, then the first session; the tips appear once', async ({ page }) => {
  await open(page)
  // the launch screen goes as soon as the app is drawn
  await expect(page.locator('#launch')).toHaveCount(0)
  // nothing that looks like a result before the level is chosen
  await expect(page.locator('.ready-figure .num')).toHaveText('—')
  await expect(page.locator('.plan-counts')).toHaveCount(0)
  await expect(page.locator('.streak')).toHaveCount(0)
  const level = page.getByRole('group', { name: /어느 급수를 준비해요\?/ })
  await expect(level.getByRole('button')).toHaveText(['N5', 'N4', 'N3', 'N2', 'N1'])
  await level.getByRole('button', { name: 'N3' }).click()

  // the answer is saved at once; the plan appears, the readiness waits for the date; focus moves to the new question
  expect((await saved(page)).settings.target).toBe(3)
  const bubble = page.locator('.guide-card .bubble')
  await expect(bubble).toBeFocused()
  await expect(bubble).toContainText('좋아요, N3! 쉬운 N5·N4 단어도 함께 나와요. 시험은 언제예요?')
  await expect(page.locator('.home-ctx')).toHaveText('N3')
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('20')
  await expect(page.locator('.ready-figure .num')).toHaveText('—')
  const dates = page.getByRole('group', { name: /시험은 언제예요/ })
  await expect(dates.getByRole('button')).toHaveText(['2026년 12월 6일', '2027년 7월 4일', '2027년 12월 5일', '아직 몰라요'])
  await dates.getByRole('button', { name: '2027년 7월 4일' }).click()

  // the first session: one primary, Ruma's
  await expect(bubble).toBeFocused()
  await expect(bubble).toContainText('준비됐어요! 오늘은 새 단어 20개')
  await expect(bubble).toContainText('시작하면 제가 한쪽 눈을 떠요')
  await expect(page.locator('.home-ctx')).toContainText('N3 · 7월 4일 시험 · D-233')
  await expect(page.locator('.ready-figure .num')).not.toHaveText('—')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 3, examDate: '2027-07-04', dailyNew: 20, includeLower: true }, guide: { done: ['level', 'exam'] } })
  await page.getByRole('button', { name: '첫 학습 시작' }).click()

  // the first reading card: Ruma says what it is, with that card only
  let tipSeen = 0
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.flash')).toBeVisible()
    if ((await page.locator('.reading-card').count()) && !tipSeen) {
      await expect(page.locator('.study-tip')).toContainText('읽기 카드예요. 한국어와 뜻이 같은 한자어는 읽는 법만 골라요.')
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
  await expect(page.locator('.guide-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '이어서 하기' })).toBeVisible()
  const tip = page.locator('.week-card .bubble.tip')
  await expect(tip).toContainText('잘했어요! 오늘 본 단어는 잊을 때쯤 다시 가져올게요.')
  await expect(page.getByRole('status').filter({ hasText: '루마: 잘했어요!' })).toHaveCount(1)
  await page.getByRole('button', { name: '알겠어요' }).click()
  await expect(tip).toHaveCount(0)
  await expect(page.locator('.week-card .bubble')).toContainText('왔어요')
  // never again, not even after a reload
  await page.reload()
  await homeShown(page)
  await expect(page.locator('.bubble.tip')).toHaveCount(0)
})

test('the readiness tip comes once the status is meaningful, and says it is not a pass probability', async ({ page }) => {
  await open(page, { state: { ...user({ fastTrack: true, examDate: '2027-07-04' }), v: 4, log: { '2026-11-10': { c: 40, n: 10, r: 32, p: 28 } }, guide: { done: ['level', 'exam', 'srs', 'reading'] } } })
  await expect(page.locator('.bubble.tip')).toContainText('시험날 떠올릴 단어 수의 어림이지, 합격 확률은 아니에요.')
  await page.reload()
  await homeShown(page)
  await expect(page.locator('.bubble.tip')).toHaveCount(0)
})

test('“아직 몰라요” plans for the next exam (the default) and says so', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N5' }).click()
  await page.getByRole('button', { name: '아직 몰라요' }).click()
  await expect(page.locator('.guide-card .bubble')).toContainText('시험일은 일단 12월 6일로 둘게요. 설정에서 바꿀 수 있어요.')
  expect((await saved(page)).settings.examDate).toBe('2026-12-06')
  await expect(page.locator('.home-ctx')).toContainText('12월 6일 시험')
})

test('a reload mid-conversation continues where it was; “급수 다시 고르기” goes back', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N2' }).click()
  await page.reload()
  await expect(page.getByRole('group', { name: /시험은 언제예요/ })).toBeVisible()
  await expect(page.locator('.home-ctx')).toHaveText('N2')
  await page.getByRole('button', { name: '급수 다시 고르기' }).click()
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
  // before the questions are answered there is nothing to study: the study route shows home
  await page.goto('./#/study')
  await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
})

test('works with the keyboard alone', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N5' }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter') // N4
  await expect(page.locator('.guide-card .bubble')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '2026년 12월 6일' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/study$/)
})

test('an existing learner sees nothing of the first run: no questions, no tips, also with reading cards', async ({ page }) => {
  await open(page, { state: user({ fastTrack: true, dailyNew: 20 }) })
  await homeShown(page)
  await expect(page.locator('.guide-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '오늘의 학습 시작' })).toBeVisible()
  await expect(page.locator('.bubble')).toContainText('쿨쿨')
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
  await expect(page.locator('.bubble.tip')).toHaveCount(0)
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
  await expect(page.locator('.home-ctx b')).toHaveText('N2')
  await expect(page.locator('.guide-card')).toHaveCount(0)
  await expect(page.locator('.bubble.tip')).toHaveCount(0)
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).guide, KEY)).toBeUndefined()
})

test('settings: “루마의 안내 다시 보기” brings the tips back', async ({ page }) => {
  await open(page, { state: user({}, { log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }), hash: '/settings' })
  await page.getByRole('button', { name: '루마의 안내 다시 보기' }).click()
  await expect(page.getByText('루마가 홈과 학습 화면에서 다시 알려 드릴게요.')).toBeVisible()
  await page.getByRole('link', { name: '홈' }).click()
  await expect(page.locator('.bubble.tip')).toContainText('잊을 때쯤 다시 가져올게요')
})

test('320px and the largest text sizes: the questions do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await open(page)
  await expect(page.getByRole('button', { name: 'N5' })).toBeVisible()
  await page.evaluate(() => {
    const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
    for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
  })
  for (const next of ['N1', '2027년 12월 5일', null]) {
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    if (next) await page.getByRole('button', { name: next }).click()
  }
})
