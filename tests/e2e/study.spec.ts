import { expect, test } from '@playwright/test'
import { answer, currentWord, NOW, open, READ_MS, saved, todayLog, user } from './fixtures'

test('onboarding → home → a full day of study → done screen → home', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('heading', { name: /잊기 전에 한 겹 더/ })).toBeVisible()
  await page.getByRole('radio', { name: 'N4' }).click()
  // a new learner studies the lower level too, unless they turn it off
  await expect(page.getByRole('switch', { name: /아래 급수 단어도 함께 \(N5\)/ })).toBeChecked()
  await page.getByRole('radio', { name: '10개' }).click()
  await expect(page.getByText('JLPT 주최 기관(JF·JEES)과 관계없는 비공식 학습 앱이에요.')).toBeVisible()
  await page.getByRole('button', { name: '시작하기' }).click()

  // home before studying: readiness first, then today's plan
  await expect(page.getByRole('heading', { name: /시험날 기억할 단어/ })).toBeVisible()
  await expect(page.locator('.home-ctx b')).toHaveText('N4')
  await expect(page.locator('.ready-info')).toContainText('N5~N4 목록 기준')
  await expect(page.locator('.ready-status')).toContainText('아직 판단하기 일러요')
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('10')
  await expect(page.locator('.plan-gain')).toContainText('오늘 하면 시험날 예상 +')
  await expect(page.locator('.bubble')).toContainText('오늘은 10장')
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await expect(page).toHaveURL(/#\/study$/)

  // each new word: 알아요 (→ 10 min) then 알아요 again (shown early thanks to learn-ahead)
  for (let i = 0; i < 20; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await expect(page.locator('.t-cards b')).toHaveText('20장')
  // 20 cards × 10 + the one quest (day cleared) 50
  await expect(page.locator('.t-xp b')).toHaveText('250')
  await expect(page.locator('.t-streak b')).toHaveText('1일')

  const s = await saved(page)
  expect(s.log['2026-11-13']).toMatchObject({ c: 20, n: 10, xp: 250, q: 1 })
  expect(s.settings.includeLower).toBe(true)
  expect(Object.keys(s.cards).every((id) => id.startsWith('5-'))).toBe(true) // N5 words first
  // study time was recorded
  expect(s.log['2026-11-13'].ms).toBeGreaterThan(0)
  expect(Object.keys(s.cards)).toHaveLength(10)
  expect(Object.values(s.cards).every((c) => (c as { state: number }).state === 2)).toBe(true)

  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.locator('.bubble')).toHaveText('두 눈 번쩍! 오늘 분량 끝.')
  await expect(page.locator('.quest-mini.done')).toHaveText('오늘 분량 끝내기')
  await expect(page.locator('.home-head .streak')).toHaveText('1')
  await expect(page.locator('.home-head .streak')).toHaveClass(/lit/)
  await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toBeVisible()
  // the streak is shown once on home
  await expect(page.locator('.streak')).toHaveCount(1)
})

test('leaving mid-session keeps progress and “이어서 하기” resumes it', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('2')
  await page.reload()
  await page.getByRole('button', { name: '이어서 하기' }).click()
  await expect(page.locator('.left-count')).toHaveText('남은 2장')
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
  // the answer is followed by when the card comes back (XP is no longer shown while studying)
  await expect(page.locator('.after-note')).toContainText('뒤 다시 나와요')
  await undo.click()
  await expect(undo).toBeDisabled()
  expect(await currentWord(page)).toBe(first)
  expect(await todayLog(page)).toBeUndefined()
  expect((await saved(page)).xp).toBe(0)
  await expect(page.locator('.left-count')).toHaveText('남은 5장')
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
  // the first new word comes from the frequency order, so it is whichever card now exists
  const cards = Object.values((await saved(page)).cards) as { state: number }[]
  expect(cards).toHaveLength(1)
  expect(cards[0].state).toBe(1)
})

test('the next day’s reviews appear (clock moves forward)', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 10; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.locator('.bubble')).toContainText('두 눈 번쩍')

  // the five words graduated with a ~2 day interval
  await page.clock.setSystemTime(new Date(NOW.getTime() + 3 * 86400_000))
  await page.reload()
  await expect(page.locator('.plan-counts .c-review b')).toHaveText('5')
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('5')
  await expect(page.getByRole('button', { name: '오늘의 학습 시작' })).toBeVisible()
  // yesterday was skipped: the streak is gone but today does not count yet
  await expect(page.locator('.home-head .streak')).toHaveText('0')
})

test('home rolls over to the new day while the app stays open', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }), time: new Date('2026-11-13T23:50:00+09:00') })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  for (let i = 0; i < 5; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.locator('.bubble')).toContainText('두 눈 번쩍')
  // the app is left open past midnight (e.g. a PWA left in the background)
  await page.clock.runFor('20:00')
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('5')
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
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.waitForTimeout(READ_MS)
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
  await other.getByRole('radio', { name: '다크' }).click()
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark')
  const s = await saved(page)
  expect(Object.keys(s.cards)).toHaveLength(3)
  expect(s.settings.theme).toBe('dark')
  // and the first tab sees the other tab's change
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test.describe('progress bar', () => {
  test('counts the whole day, so resuming does not start from zero', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    const bar = page.getByRole('progressbar', { name: '오늘 학습' })
    await expect(bar).toHaveAttribute('aria-valuenow', '0')
    await expect(page.locator('.left-count')).toHaveText('남은 5장')
    for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
    await page.getByRole('button', { name: /나가기/ }).click()
    await page.getByRole('button', { name: '이어서 하기' }).click()
    await expect(bar).toHaveAttribute('aria-valuenow', '3')
    await expect(bar).toHaveAttribute('aria-valuemax', '5')
    await expect(page.locator('.left-count')).toHaveText('남은 2장')
    // the fill is Astryx ProgressBar's documented theming target; it is drawn full width and slid left, clipped by the
    // track, so the visible share is where its right edge ends inside the track
    const fill = await bar.locator('.astryx-progress-bar-fill').evaluate((el) => {
      const f = el.getBoundingClientRect()
      const t = el.parentElement!.getBoundingClientRect()
      return (f.right - t.left) / t.width
    })
    expect(fill).toBeCloseTo(0.6, 1)
    // the old three-colour count row is gone
    await expect(page.locator('.study-counts')).toHaveCount(0)
  })
})

test.describe('a forgotten card', () => {
  const spy = () => {
    const w = window as unknown as { __spoken: string[] }
    w.__spoken = []
    if ('speechSynthesis' in window) {
      speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void w.__spoken.push(u.text)
      speechSynthesis.cancel = () => {}
    }
  }
  const spoken = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)

  test('says when it comes back, marks the card and stays silent when auto-speak is off', async ({ page }) => {
    await page.addInitScript(spy)
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    await expect(page.locator('.flash-head')).toHaveText('새 단어')
    await expect(page.locator('.flash')).not.toHaveClass(/missed/)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(page.locator('.flash-head').getByRole('status').filter({ hasText: '다시 나와요' })).toHaveText('다시 나와요 · 1분')
    await expect(page.locator('.flash-head')).not.toContainText('새 단어')
    await expect(page.locator('.flash')).toHaveClass(/missed/)
    expect(await spoken(page)).toEqual([])
  })

  test('with auto-speak on, the reading is played once more when the card is missed', async ({ page }) => {
    await page.addInitScript(spy)
    await open(page, { state: user({ dailyNew: 5, autoSpeak: true }) })
    await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
    await expect.poll(async () => (await spoken(page)).length).toBe(1) // the card appeared after a tap
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    const [first] = await spoken(page)
    await expect.poll(() => spoken(page)).toEqual([first, first])
    // confirming moves on without another play
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: '확인했어요 · 다음' }).click()
    await expect.poll(async () => (await spoken(page)).length).toBe(3) // only the next card's own auto-speak
  })

  test('auto-speak waits for a user gesture: opening the study page directly plays nothing', async ({ page }) => {
    await page.addInitScript(spy)
    // the page has not been interacted with yet (Playwright's own navigation counts as activation)
    await page.addInitScript(() => Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { hasBeenActive: false } }))
    await open(page, { state: user({ dailyNew: 5, autoSpeak: true }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    await page.waitForTimeout(300)
    expect(await spoken(page)).toEqual([])
  })

  test('answer buttons carry the interval in their accessible name', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await page.getByRole('button', { name: '정답 보기' }).click()
    await expect(page.getByRole('button', { name: '모르겠어요, 1분 뒤 다시' })).toBeVisible()
  })
})

test.describe('nothing new left in the target level', () => {
  const allOfN5 = () => {
    const due = NOW.getTime() + 5 * 86400_000
    const c = { due, stability: 10, difficulty: 5, elapsed_days: 3, scheduled_days: 8, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: due - 8 * 86400_000 }
    return Object.fromEntries(Array.from({ length: 718 }, (_, i) => [`5-${i}`, c]))
  }

  test('offers the next level and the mascot sleeps on a day with nothing to do', async ({ page }) => {
    await open(page, { state: user({ target: 5 }, { cards: allOfN5() }) })
    await expect(page.locator('.bubble')).toHaveText('N5 단어를 모두 만났어요. 다음은 N4!')
    await expect(page.locator('.week-card .ruma')).toHaveClass(/sleep/)
    await page.getByRole('button', { name: 'N4 시작하기' }).click()
    await expect(page).toHaveURL(/#\/study$/)
    await expect(page.locator('.flash')).toBeVisible()
    expect((await saved(page)).settings.target).toBe(4)
  })

  test('a day with no reviews but new words left suggests them', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }) })
    await expect(page.locator('.bubble')).toHaveText('오늘은 복습이 없어요. 새 단어를 해 볼까요?')
    await expect(page.locator('.week-card .ruma')).toHaveClass(/sleep/)
    await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toBeVisible()
  })
})

test('at 320px the three answer buttons stay on one line each', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
  await expect(page.locator('.flash')).toBeVisible()
  await page.waitForTimeout(400) // let the card's slide-in finish
  const buttons = await page.locator('.answer-bar').getByRole('button').all()
  expect(buttons.length).toBeGreaterThan(0)
  for (const b of buttons) {
    // the visible label; one client rect = one line
    const h = await b.evaluate((el) => {
      const r = document.createRange()
      r.selectNodeContents(el.querySelector('.grade-label')!)
      return r.getClientRects().length
    })
    expect(h).toBe(1)
  }
  // nothing sticks out sideways (documentElement.scrollWidth keeps the slide-in's overflow in Chromium, so check boxes)
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > 320.5).length)).toBe(0)
})

test.describe('two-step answering (05 batch 2)', () => {
  test('before the answer only “모르겠어요” and “정답 보기”; grades appear after, with “알아요” the one primary', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const bar = page.locator('.answer-bar')
    await expect(bar.getByRole('button')).toHaveText(['모르겠어요', '정답 보기'])
    // the one primary of the group (Astryx Button reflects its variant as data-variant)
    await expect(bar.locator('button[data-variant="primary"]')).toHaveText('정답 보기')
    await expect(page.getByRole('button', { name: /^알아요/ })).toHaveCount(0)
    // the grade keys do nothing before the answer is shown
    await page.keyboard.press('2')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('3')
    await page.waitForTimeout(200)
    expect(await todayLog(page)).toBeUndefined()
    await bar.getByRole('button', { name: '정답 보기' }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await expect(bar.getByRole('button')).toHaveCount(3)
    await expect(bar.locator('button[data-variant="primary"]')).toHaveCount(1)
    await expect(bar.locator('button[data-variant="primary"]')).toContainText('알아요')
    // same height on both steps, so the thumb does not move
    expect(await bar.getByRole('button').first().evaluate((el) => el.getBoundingClientRect().height)).toBe(60)
  })

  test('number keys: Space shows, 2 answers 알아요, 1 on the front is 모르겠어요, 3 answers 쉬워요', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.press('Space')
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('2')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('1')
    await expect(page.locator('.flash.missed')).toBeVisible()
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('1')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('3')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(3)
    const s = await saved(page)
    // the third word introduced (frequency order; cards keep their insertion order)
    expect(Object.keys(s.cards)).toHaveLength(3)
    expect(s.cards[Object.keys(s.cards)[2]].state).toBe(2) // 쉬워요 on a new word graduates it
  })

  test('a double tap on “정답 보기” shows the answer but does not grade the card', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await page.getByRole('button', { name: '정답 보기' }).dblclick()
    await page.waitForTimeout(300)
    await expect(page.locator('.flash-meaning')).toBeVisible()
    expect(await todayLog(page)).toBeUndefined()
  })

  test('undo from the chip under the card works after the two-step answer', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const first = await currentWord(page)
    await answer(page, '쉬워요')
    await page.getByRole('button', { name: '되돌리기', exact: true }).click()
    await expect(page.locator('.flash-word')).toHaveText(first)
    expect(await todayLog(page)).toBeUndefined()
  })
})

test('waiting for learning cards: says when they return and “지금 마무리” shows them at once', async ({ page }) => {
  const due = NOW.getTime() + 40 * 60_000
  const relearning = { due, stability: 1, difficulty: 6, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 4, lapses: 1, state: 3, last_review: NOW.getTime() - 60_000 }
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-0': relearning }, log: { '2026-11-13': { c: 1, n: 0, r: 1, p: 0 } } }), hash: '/study' })
  await expect(page.getByText('40분 뒤에 익히는 중인 1장이 돌아와요.')).toBeVisible()
  await page.getByRole('button', { name: '남은 1장 지금 마무리' }).click()
  await expect(page.locator('.flash')).toBeVisible()
  await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
})
