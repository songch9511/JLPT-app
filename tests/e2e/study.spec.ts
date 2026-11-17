import { expect, test } from '@playwright/test'
import { answer, currentWord, NOW, open, READ_MS, saved, todayLog, user } from './fixtures'
import { levelOfId } from '../../src/ids'

test('first run → a full day of study (new words, then kanji) → done screen → home', async ({ page }) => {
  await open(page)
  // the level cards, then three short intro pages
  await expect(page.locator('.first-note')).toHaveCount(0)
  await page.getByRole('button', { name: 'N4', exact: true }).click()
  await page.getByRole('button', { name: 'N4 시작하기' }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  // the daily new words are chosen on the last page (and changed in 설정 later)
  await page.getByRole('button', { name: '10', exact: true }).click()
  await expect(page.locator('.intro-time b')).toHaveText('8분')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()

  // home before studying: the level as a label, the first session the one primary
  await expect(page.getByRole('heading', { name: '오늘의 계획' })).toBeVisible()
  await expect(page.getByRole('img', { name: '준비하는 급수 N4' })).toBeVisible()
  await expect(page.locator('.go-new .home-go-count')).toHaveText('10개')
  await expect(page.locator('.go-kanji .home-go-count')).toHaveText('5자')
  await expect(page.locator('.today-count')).toHaveText('0 / 15')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  await page.getByRole('button', { name: '첫 학습 시작, 단어 10개' }).click()
  await expect(page).toHaveURL(/#\/study\/new$/)

  // each new word: 알아요 (→ 10 min) then 알아요 again (shown early thanks to learn-ahead)
  for (let i = 0; i < 20; i++) await answer(page, '알아요')
  // the words are done; the kanji session is next
  await expect(page.getByRole('heading', { name: '새 단어 끝', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '한자 시작, 5자' }).click()
  await expect(page).toHaveURL(/#\/study\/kanji$/)
  for (let i = 0; i < 10; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
  // Ruma's open eyes say it; no sentence repeats it. 30 cards × 10 + the one quest (day cleared) 50
  await expect(page.locator('.done-body p')).toHaveCount(0)
  await expect(page.locator('.done-figures dd')).toHaveText(['30장', '1일', '350'])

  const s = await saved(page)
  expect(s.log['2026-11-13']).toMatchObject({ c: 30, n: 10, kn: 5, xp: 350, q: 1 })
  expect(s.settings.includeLower).toBe(true)
  expect(s.settings.dailyNew).toBe(10)
  const words = Object.keys(s.cards).filter((id) => id.startsWith('w'))
  expect(words.every((id) => levelOfId(id) === 5)).toBe(true) // N5 words first
  expect(words).toHaveLength(10)
  expect(Object.keys(s.cards).filter((id) => id.startsWith('k'))).toHaveLength(5)
  expect(s.log['2026-11-13'].ms).toBeGreaterThan(0)
  expect(Object.values(s.cards).every((c) => (c as { state: number }).state === 2)).toBe(true)

  await page.getByRole('button', { name: '홈으로' }).click()
  // Ruma has both eyes open and says nothing
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'day')
  await expect(page.getByText(/잊을 때쯤|두 눈 다 떴어요|내일 봐요/)).toHaveCount(0)
  await expect(page.locator('.today-count')).toHaveText('30 / 30')
  await expect(page.locator('.home-done')).toHaveText('오늘 끝')
  await expect(page.locator('.home-head .streak')).toHaveText('1')
  await expect(page.getByRole('button', { name: '단어 더 하기, 10개' })).toHaveText('단어 더10개')
  await expect(page.getByRole('button', { name: '단어 더 하기, 10개' })).toHaveAttribute('data-variant', 'secondary')
  await expect(page.locator('.streak')).toHaveCount(1)
})

test('leaving mid-session keeps progress and “이어서 하기” resumes it', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('.go-new .home-go-count')).toHaveText('2개')
  await page.reload()
  await page.getByRole('button', { name: '이어서 하기' }).click()
  await expect(page.locator('.left-count')).toHaveAttribute('data-left', '2')
  await answer(page, '쉬워요')
  await answer(page, '쉬워요')
  await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
  expect((await todayLog(page)).c).toBe(5)
})

test('undo restores the answer, the XP and shows the same card again', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  const undo = page.getByRole('button', { name: '방금 답 되돌리기' })
  await expect(undo).toBeDisabled()
  const first = await currentWord(page)
  await answer(page, '알아요')
  await expect(undo).toBeEnabled()
  // the answer is followed by when the card comes back (XP is no longer shown while studying)
  await expect(page.locator('.after-note')).toContainText('뒤 다시 나와요')
  await undo.press('Enter')
  await expect(undo).toBeDisabled()
  expect(await currentWord(page)).toBe(first)
  expect(await todayLog(page)).toBeUndefined()
  expect((await saved(page)).xp).toBe(0)
  await expect(page.locator('.left-count')).toHaveAttribute('data-left', '5')
})

test('undo brings back the card that was undone even after its predecessor became due', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  const a = await currentWord(page)
  await answer(page, '모르겠어요') // A comes back in 1 minute
  const b = await currentWord(page)
  expect(b).not.toBe(a)
  await answer(page, '알아요')
  // two minutes later A is due; undoing B must still put B back on screen
  await page.clock.fastForward('02:00')
  await page.getByRole('button', { name: '방금 답 되돌리기' }).press('Enter')
  await expect(page.locator('.flash-word')).toHaveText(b)
})

test('“모르겠어요” always shows the answer before moving on', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  expect(await todayLog(page)).toBeUndefined()
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
  // the first new word comes from the frequency order, so it is whichever card now exists
  const cards = Object.values((await saved(page)).cards) as { state: number }[]
  expect(cards).toHaveLength(1)
  expect(cards[0].state).toBe(1)
})

test('the next day’s reviews appear (clock moves forward)', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  for (let i = 0; i < 10; i++) await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'day')

  // the five words graduated with a ~2 day interval
  await page.clock.setSystemTime(new Date(NOW.getTime() + 3 * 86400_000))
  await page.reload()
  await expect(page.locator('.go-review .home-go-count')).toHaveText('5장')
  await expect(page.locator('.go-new .home-go-count')).toHaveText('5개')
  await expect(page.getByRole('button', { name: '복습 시작, 5장' })).toBeVisible()
  await expect(page.getByRole('button', { name: '단어 시작, 5개' })).toBeVisible()
  // yesterday was skipped: the streak is gone but today does not count yet
  await expect(page.locator('.home-head .streak')).toHaveText('0')
})

test('home rolls over to the new day while the app stays open', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }), time: new Date('2026-11-13T23:50:00+09:00') })
  await page.getByRole('button', { name: '단어 시작' }).click()
  for (let i = 0; i < 5; i++) await answer(page, '쉬워요')
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'day')
  // the app is left open past midnight (e.g. a PWA left in the background)
  await page.clock.runFor('20:00')
  await expect(page.locator('.go-new .home-go-count')).toHaveText('5개')
  await expect(page.getByRole('button', { name: '단어 시작, 5개' })).toBeVisible()
})

test('waiting for a learning card brings it back on its own once it is due', async ({ page }) => {
  const due = NOW.getTime() + 25 * 60_000
  const relearning = { due, stability: 1, difficulty: 6, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 4, lapses: 1, state: 3, last_review: NOW.getTime() - 60_000 }
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-0': relearning }, log: { '2026-11-13': { c: 1, n: 0, r: 1, p: 0 } } }), hash: '/study' })
  await expect(page.getByRole('heading', { name: '익히는 중 1장', level: 1 })).toBeVisible()
  await page.clock.runFor('06:00')
  await expect(page.locator('.flash')).toBeVisible()
})

test('a double tap on an answer button answers only the card on screen', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  await expect(page.locator('.flash')).toBeVisible()
  await page.getByRole('button', { name: /^쉬워요/ }).dblclick()
  await page.waitForTimeout(300)
  expect((await todayLog(page)).c).toBe(1)
})

test('a double tap on “모르겠어요” still shows the answer', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '단어 시작' }).click()
  await page.getByRole('button', { name: /^모르겠어요/ }).dblclick()
  await page.waitForTimeout(300)
  await expect(page.locator('.flash-meaning')).toBeVisible()
  expect(await todayLog(page)).toBeUndefined()
})

test.describe('keyboard', () => {
  test('Space opens both toggles, number keys answer (← and → move between cards since swiping, they no longer grade)', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '단어 시작' }).click()
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await expect(page.getByRole('button', { name: '의미', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '히라가나', exact: true })).toHaveAttribute('aria-pressed', /true|false/)
    await page.keyboard.press('ArrowRight') // the card to answer is the last one: nothing further, nothing graded
    await page.waitForTimeout(200)
    expect(await todayLog(page)).toBeUndefined()
    await page.keyboard.press('2')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('1') // first opens everything
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('Enter') // opens everything (it is open already): grades nothing
    await page.waitForTimeout(200)
    expect((await todayLog(page))?.c).toBe(1)
    await page.keyboard.press('1') // then grades “모르겠어요”
    await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
  })

  test('holding an arrow key answers one card, not one per key repeat', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '단어 시작' }).click()
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
    await page.getByRole('button', { name: '단어 시작' }).click()
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
    await page.getByRole('button', { name: '단어 시작' }).click()
    const bar = page.getByRole('progressbar', { name: '학습 진행' })
    await expect(bar).toHaveAttribute('aria-valuenow', '0')
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '5')
    for (let i = 0; i < 3; i++) await answer(page, '쉬워요')
    await page.getByRole('button', { name: /나가기/ }).click()
    await page.getByRole('button', { name: '이어서 하기' }).click()
    await expect(bar).toHaveAttribute('aria-valuenow', '3')
    await expect(bar).toHaveAttribute('aria-valuemax', '5')
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '2')
    // the visible share: the fill's width inside the track
    const fill = await bar.locator('i').evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width)
    expect(fill).toBeCloseTo(0.6, 1)
    // the old three-colour count row is gone
    await expect(page.locator('.study-counts')).toHaveCount(0)
  })
})

test.describe('a forgotten card', () => {
  test('opens everything, keeps the three grades and the card’s facts', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }) })
    await page.getByRole('button', { name: '단어 시작' }).click()
    await expect(page.locator('.flash-head .flash-meta')).toHaveText('새 단어')
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await expect(page.locator('.flash-toggles')).toBeVisible()
    await expect(page.getByRole('button', { name: '모르겠어요, 1분 뒤 다시' })).toBeVisible()
    await expect(page.locator('.flash-head .flash-meta')).toHaveText('새 단어')
  })

  test('answer buttons carry the interval in their accessible name, from the start', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await expect(page.getByRole('button', { name: '모르겠어요, 1분 뒤 다시' })).toBeVisible()
  })
})

test.describe('nothing new left in the target level', () => {
  const allOfN5 = () => {
    const due = NOW.getTime() + 5 * 86400_000
    const c = { due, stability: 10, difficulty: 5, elapsed_days: 3, scheduled_days: 8, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: due - 8 * 86400_000 }
    return Object.fromEntries(Array.from({ length: 718 }, (_, i) => [`5-${i}`, c]))
  }

  test('the level is changed only in 설정: home offers no other level, and the mascot sleeps on a day with nothing to do', async ({ page }) => {
    await open(page, { state: user({ target: 5 }, { cards: allOfN5() }) })
    await expect(page.locator('.today-ruma .ruma')).toHaveClass(/sleep/)
    await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'sleep')
    await expect(page.getByRole('button', { name: /N4/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /급수 N5/ })).toHaveCount(0)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(0)
  })

  test('a day with no reviews but new words left suggests them', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }) })
    await expect(page.locator('.today-ruma .ruma')).toHaveClass(/sleep/)
    await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'sleep')
    await expect(page.getByText(/오늘은 쉬어요/)).toHaveCount(0)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: '단어 더 하기, 10개' })).toHaveText('단어 더10개')
    await expect(page.getByRole('button', { name: '단어 더 하기, 10개' })).toHaveAttribute('data-variant', 'primary')
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

test.describe('answering (2026-11-16: the grades from the start)', () => {
  test('the three grades are there from the start, “알아요” the one primary; 알아요 and 쉬워요 grade without opening anything', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const bar = page.locator('.answer-bar')
    await expect(page.locator('.flash')).toBeVisible()
    await expect(bar.getByRole('button')).toHaveText([/^모르겠어요/, /^알아요/, /^쉬워요/])
    await expect(bar.locator('button[data-variant="primary"]')).toHaveCount(1)
    await expect(bar.locator('button[data-variant="primary"]')).toContainText('알아요')
    await expect(page.getByRole('button', { name: '정답 보기' })).toHaveCount(0)
    // nothing is open: the meaning and the reading are not shown
    await expect(page.locator('.flash-meaning')).not.toBeVisible()
    await expect(page.getByRole('button', { name: '의미', exact: true })).toHaveAttribute('aria-pressed', 'false')
    // a known word is passed quickly: 알아요 grades at once
    const first = await page.locator('.flash-word').innerText()
    await page.waitForTimeout(READ_MS)
    await bar.getByRole('button', { name: /^알아요/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await expect(page.locator('.flash-word')).not.toHaveText(first)
    const s1 = await saved(page)
    expect(Object.values(s1.cards)).toHaveLength(1)
    // …and so does 쉬워요, again without opening
    await page.waitForTimeout(READ_MS)
    await bar.getByRole('button', { name: /^쉬워요/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
    // a tap on the card opens nothing (only the toggles and the bookmark do)
    await page.waitForTimeout(READ_MS)
    await page.locator('.flash-word').click()
    await page.locator('.flash').click({ position: { x: 30, y: 200 } })
    await expect(page.locator('.flash-meaning')).not.toBeVisible()
    expect((await todayLog(page)).c).toBe(2)
  })

  test('number keys: Space opens, 2 answers 알아요, 1 is 모르겠어요 (closed: it opens first; then 1 grades), 3 answers 쉬워요', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.press('Space')
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('2')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('1')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    expect((await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('1')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(2)
    await page.waitForTimeout(READ_MS)
    // 3 without opening anything first
    await page.keyboard.press('3')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(3)
    const s = await saved(page)
    // the third word introduced (frequency order; cards keep their insertion order)
    expect(Object.keys(s.cards)).toHaveLength(3)
    expect(s.cards[Object.keys(s.cards)[2]].state).toBe(2) // 쉬워요 on a new word graduates it
  })

  test('a double tap on a toggle opens and closes it again and grades nothing', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    await page.getByRole('button', { name: '의미', exact: true }).dblclick()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: '의미', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect(await todayLog(page)).toBeUndefined()
  })

  test('undo from the chip under the card works after an answer', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const first = await currentWord(page)
    await answer(page, '쉬워요')
    await page.getByRole('button', { name: '되돌리기', exact: true }).click()
    await expect(page.locator('.flash-word')).toHaveText(first)
    expect(await todayLog(page)).toBeUndefined()
  })
})

test('waiting for learning cards: says when they return and “지금 하기” shows them at once', async ({ page }) => {
  const due = NOW.getTime() + 40 * 60_000
  const relearning = { due, stability: 1, difficulty: 6, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 4, lapses: 1, state: 3, last_review: NOW.getTime() - 60_000 }
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-0': relearning }, log: { '2026-11-13': { c: 1, n: 0, r: 1, p: 0 } } }), hash: '/study' })
  await expect(page.getByRole('heading', { name: '익히는 중 1장', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: '40분 뒤에 돌아와요' })).toHaveText('40분 뒤')
  await page.getByRole('button', { name: '1장 지금 하기' }).click()
  await expect(page.locator('.flash')).toBeVisible()
  await answer(page, '알아요')
  await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
})

test.describe('the answer bar and the sessions (2026-11-16 redesign)', () => {
  test('each grade’s interval is a second line inside its button and part of its name; the buttons do not move when the card opens or after 모르겠어요', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const bar = page.locator('.answer-bar')
    await expect(page.locator('.flash')).toBeVisible()
    const buttons = bar.getByRole('button')
    await expect(buttons).toHaveCount(3)
    const boxes = async () => Promise.all((await buttons.all()).map(async (b) => (await b.boundingBox())!))
    const closed = await boxes()
    const labels = await bar.locator('.grade-after').allInnerTexts()
    expect(labels).toHaveLength(3)
    for (const l of labels) expect(l).toMatch(/^(1분 이내|\d+(분|시간|일|개월) 뒤)$/)
    for (const [i, b] of (await buttons.all()).entries()) {
      const label = (await b.locator('.grade-label').boundingBox())!
      const after = (await b.locator('.grade-after').boundingBox())!
      // the interval under the name, inside the button, centred on it, hidden from the tree (the name carries it)
      expect(after.y).toBeGreaterThanOrEqual(label.y + label.height - 1)
      expect(after.y + after.height).toBeLessThanOrEqual(closed[i].y + closed[i].height)
      expect(Math.abs(after.x + after.width / 2 - (closed[i].x + closed[i].width / 2))).toBeLessThan(1)
      await expect(b.locator('.grade-after')).toHaveAttribute('aria-hidden', 'true')
      await expect(b).toHaveAccessibleName(`${['모르겠어요', '알아요', '쉬워요'][i]}, ${labels[i]} 다시`)
      expect(closed[i].height).toBe(68)
    }
    // opening the card moves nothing in the bar
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: '히라가나', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await boxes()).toEqual(closed)
    // 모르겠어요 on the open card grades it; the three are where they were for the next card
    await page.waitForTimeout(READ_MS)
    await bar.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    expect(await boxes()).toEqual(closed)
    // three grades, 알아요 the one ink primary: white label on the ink
    const good = bar.getByRole('button', { name: /^알아요/ })
    await expect(good).toHaveAttribute('data-variant', 'primary')
    expect(await good.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(['rgb(45, 42, 38)', 'rgb(255, 255, 255)'])
    await expect(bar.locator('button[data-variant="secondary"]')).toHaveCount(2)
  })

  test('the plain study route still mixes reviews and new words in one session', async ({ page }) => {
    const t = NOW.getTime()
    const review = { due: t - 3600_000, stability: 10, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: t - 5 * 86400_000 }
    await open(page, { state: user({ dailyNew: 2 }, { cards: { '5-0': review, '5-1': review } }), hash: '/study' })
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '4')
    for (let i = 0; i < 4; i++) await answer(page, '쉬워요')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    expect(await todayLog(page)).toMatchObject({ c: 4, n: 2, r: 2 })
  })

  test('the new-words session: only new words and their steps; when it ends first it says what is left; the last session of the day says 오늘 끝', async ({ page }) => {
    const t = NOW.getTime()
    const review = { due: t - 3600_000, stability: 10, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: t - 5 * 86400_000 }
    await open(page, { state: user({ dailyNew: 2 }, { cards: { '5-0': review, '5-1': review } }), hash: '/study/new' })
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '2')
    // a word answered "모르겠어요" comes back in this session, not in the reviews
    await answer(page, '모르겠어요')
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '2')
    await answer(page, '쉬워요')
    await page.clock.fastForward('02:00')
    await answer(page, '쉬워요')
    await expect(page.getByRole('heading', { name: '새 단어 끝', level: 1 })).toBeVisible()
    // what is left is the other session, as its button: the next thing to do, the one primary
    const reviews = page.getByRole('button', { name: '복습 시작, 2장' })
    await expect(reviews).toHaveText('복습2장')
    await expect(reviews).toHaveAttribute('data-variant', 'primary')
    expect(await todayLog(page)).toMatchObject({ c: 3, n: 2, r: 0 })
    // the day's quest (finish everything) is not paid yet: 3 cards × 10
    expect((await saved(page)).xp).toBe(30)
    await expect(page.getByRole('button', { name: '홈으로' })).toHaveAttribute('data-variant', 'secondary')
    await expect(page.locator('.done-actions').getByRole('button')).toHaveCount(2)
    // the reviews, then the whole day is done
    await reviews.click()
    await expect(page).toHaveURL(/#\/study\/review$/)
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '2')
    await answer(page, '쉬워요')
    await answer(page, '쉬워요')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    expect(await todayLog(page)).toMatchObject({ c: 5, n: 2, r: 2, q: 1 })
    expect((await saved(page)).xp).toBe(100)
    // more new words from the review session's done screen open the new-words session
    await page.getByRole('button', { name: '단어 더 하기, 10개' }).click()
    await expect(page).toHaveURL(/#\/study\/new$/)
    await expect(page.locator('.left-count')).toHaveAttribute('data-left', '10')
    await expect(page.locator('.flash-meta')).toContainText('새 단어')
  })
})
