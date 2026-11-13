import { expect, test } from '@playwright/test'
import { answer, currentWord, NOW, open, READ_MS, saved, todayLog, user } from './fixtures'

test('onboarding → home → a full day of study → done screen → home', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('heading', { name: /잊기 전에 한 겹 더/ })).toBeVisible()
  await page.getByRole('button', { name: 'N4' }).click()
  await page.getByRole('button', { name: '10개' }).click()
  await page.getByRole('button', { name: '시작하기' }).click()

  // home before studying
  await expect(page.getByText('N4 여정')).toBeVisible()
  await expect(page.locator('.hero-counts .c-new b')).toHaveText('10')
  await expect(page.locator('.bubble')).toContainText('오늘은 10장')
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await expect(page).toHaveURL(/#\/study$/)

  // each new word: 알아요 (→ 10 min) then 알아요 again (shown early thanks to learn-ahead)
  for (let i = 0; i < 20; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await expect(page.locator('.t-cards b')).toHaveText('20장')
  // 20 cards × 10 + quests (20 cards, 10 new words, day cleared) 20 + 20 + 50
  await expect(page.locator('.t-xp b')).toHaveText('290')
  await expect(page.locator('.t-streak b')).toHaveText('1일')

  const s = await saved(page)
  expect(s.log['2026-11-13']).toMatchObject({ c: 20, n: 10, xp: 290, q: 7 })
  expect(Object.keys(s.cards)).toHaveLength(10)
  expect(Object.values(s.cards).every((c) => (c as { state: number }).state === 2)).toBe(true)

  await page.getByRole('button', { name: '계속하기' }).click()
  await expect(page.locator('.bubble')).toHaveText('가득 찼다! 오늘 목표 달성이에요.')
  await expect(page.locator('.quests .quest.done')).toHaveCount(3)
  await expect(page.locator('.hud-item.streak')).toHaveText('1')
  await expect(page.locator('.hud-item.streak')).toHaveClass(/lit/)
  await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toBeVisible()
  await expect(page.getByText(/10 \/ 668 단어를 만났어요/)).toBeVisible()
})

test('leaving mid-session keeps progress and “이어서 하기” resumes it', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('.hero-counts .c-new b')).toHaveText('2')
  await page.reload()
  await page.getByRole('button', { name: '이어서 하기' }).click()
  await expect(page.locator('.study-counts .c-new')).toHaveText('새 단어 2')
  await answer(page, '쉬워요')
  await answer(page, '쉬워요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  expect((await todayLog(page)).c).toBe(5)
})

test('undo restores the answer, the XP and shows the same card again', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  const undo = page.getByRole('button', { name: '방금 선택 되돌리기' })
  await expect(undo).toBeDisabled()
  const first = await currentWord(page)
  await answer(page, '알아요')
  await expect(undo).toBeEnabled()
  await expect(page.locator('.study-top .hud-item.xp')).toContainText('10')
  await undo.click()
  await expect(undo).toBeDisabled()
  expect(await currentWord(page)).toBe(first)
  expect(await todayLog(page)).toBeUndefined()
  expect((await saved(page)).xp).toBe(0)
  await expect(page.locator('.study-counts .c-new')).toHaveText('새 단어 5')
})

test('undo brings back the card that was undone even after its predecessor became due', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  const a = await currentWord(page)
  await answer(page, '모르겠어요') // A comes back in 1 minute
  const b = await currentWord(page)
  expect(b).not.toBe(a)
  await answer(page, '알아요')
  // two minutes later A is due; undoing B must still put B back on screen
  await page.clock.fastForward('02:00')
  await page.getByRole('button', { name: '방금 선택 되돌리기' }).click()
  await expect(page.locator('.flash-word')).toHaveText(b)
})

test('“모르겠어요” always shows the answer before moving on', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  expect(await todayLog(page)).toBeUndefined()
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: '확인했어요 · 다음' }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
  expect((await saved(page)).cards['5-0'].state).toBe(1)
})

test('the next day’s reviews appear (clock moves forward)', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 10; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await page.getByRole('button', { name: '계속하기' }).click()
  await expect(page.locator('.bubble')).toContainText('가득 찼다')

  // the five words graduated with a ~2 day interval
  await page.clock.setSystemTime(new Date(NOW.getTime() + 3 * 86400_000))
  await page.reload()
  await expect(page.locator('.hero-counts .c-review b')).toHaveText('5')
  await expect(page.locator('.hero-counts .c-new b')).toHaveText('5')
  await expect(page.getByRole('button', { name: '오늘의 학습 시작' })).toBeVisible()
  // yesterday was skipped: the streak is gone but today does not count yet
  await expect(page.locator('.hud-item.streak')).toHaveText('0')
})

test('home rolls over to the new day while the app stays open', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }), time: new Date('2026-11-13T23:50:00+09:00') })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 5; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: '계속하기' }).click()
  await expect(page.locator('.bubble')).toContainText('가득 찼다')
  // the app is left open past midnight (e.g. a PWA left in the background)
  await page.clock.runFor('20:00')
  await expect(page.locator('.hero-counts .c-new b')).toHaveText('5')
  await expect(page.getByRole('button', { name: '오늘의 학습 시작' })).toBeVisible()
})

test('“잠깐 쉬어 가요” brings the waiting card back on its own once it is due', async ({ page }) => {
  const due = NOW.getTime() + 25 * 60_000
  const relearning = { due, stability: 1, difficulty: 6, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 4, lapses: 1, state: 3, last_review: NOW.getTime() - 60_000 }
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-0': relearning }, log: { '2026-11-13': { c: 1, n: 0, r: 1, p: 0 } } }), hash: '/study' })
  await expect(page.getByRole('heading', { name: '잠깐 쉬어 가요' })).toBeVisible()
  await page.clock.runFor('06:00')
  await expect(page.locator('.flash')).toBeVisible()
})

test('a double tap on an answer button answers only the card on screen', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await page.locator('.flash').click()
  await page.getByRole('button', { name: /^쉬워요/ }).dblclick()
  await page.waitForTimeout(300)
  expect((await todayLog(page)).c).toBe(1)
})

test('a double tap on “모르겠어요” still shows the answer', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await page.getByRole('button', { name: /^모르겠어요/ }).dblclick()
  await page.waitForTimeout(300)
  await expect(page.locator('.flash-meaning')).toBeVisible()
  expect(await todayLog(page)).toBeUndefined()
})

test.describe('keyboard', () => {
  test('space reveals, arrows answer', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('ArrowLeft') // first reveals
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('Enter') // then confirms “모르겠어요”
    await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
  })

  test('holding an arrow key answers one card, not one per key repeat', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('ArrowUp') // auto-repeat
    await page.keyboard.down('ArrowUp')
    await page.keyboard.up('ArrowUp')
    await page.waitForTimeout(200)
    expect((await todayLog(page)).c).toBe(1)
  })

  test('Enter on a focused button activates that button instead of the card shortcut', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    await expect(page.locator('.flash')).toBeVisible()
    await page.getByRole('button', { name: /나가기/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/$/)
  })
})

test('a card last reviewed “in the future” (clock set back) still opens and can be answered', async ({ page }) => {
  const t = NOW.getTime()
  const ahead = { due: t - 60_000, stability: 3, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: t + 86400_000 }
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-1': ahead } }), hash: '/study' })
  await answer(page, '알아요')
  expect(errors).toEqual([])
})

test('two open tabs do not overwrite each other’s progress', async ({ page, context }) => {
  await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
  const other = await context.newPage()
  await other.goto('./#/settings')
  await expect(other.getByRole('heading', { name: '설정' })).toBeVisible()
  for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
  await other.getByRole('button', { name: '다크' }).click()
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark')
  const s = await saved(page)
  expect(Object.keys(s.cards)).toHaveLength(3)
  expect(s.settings.theme).toBe('dark')
  // and the first tab sees the other tab's change
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
