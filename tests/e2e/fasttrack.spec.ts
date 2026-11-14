import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { L, NOW, open, READ_MS, saved, user } from './fixtures'

// N5 in introduction order (frequency), straight from the shipped data
const N5 = JSON.parse(readFileSync(new URL('../../public/data/n5.json', import.meta.url), 'utf8')) as (string | number)[][]
const ORDER = N5.map((r, i) => [r[4] as number, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
const T = NOW.getTime()
const DAY = 86_400_000
/** Review cards for the first `n` words of the order, due well after today: the next new word is ORDER[n]. */
const seen = (n: number) =>
  Object.fromEntries(
    ORDER.slice(0, n).map((i) => [
      `5-${i}`,
      { due: T + 20 * DAY, stability: 30, difficulty: 5, elapsed_days: 3, scheduled_days: 23, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: T - 3 * DAY },
    ]),
  )
const firstOf = (k: string) => ORDER.findIndex((i) => N5[i][6] === k)

test('an S word is asked for its reading: four choices, a wrong pick shows the answer, the bridge and the meaning', async ({ page }) => {
  const pos = firstOf('S')
  const idx = ORDER[pos]
  const [w, r, ko, , , , , sk] = N5[idx] as string[]
  await open(page, { state: user({ fastTrack: true, dailyNew: 3 }, { cards: seen(pos) }), hash: '/study' })

  const card = page.locator('.flash.reading-card')
  await expect(card).toBeVisible()
  await expect(page.locator('.flash-word')).toHaveText(w)
  await expect(card.locator('.flash-head').getByText('읽기', { exact: true })).toBeVisible()
  await expect(card.locator('.flash-head').getByText('새 단어', { exact: true })).toBeVisible()
  await expect(page.locator('#reading-prompt')).toHaveText('어떻게 읽을까요?')
  // the speaker would give the answer away before answering
  await expect(page.getByRole('button', { name: '발음 듣기' })).toHaveCount(0)
  await expect(page.locator('.flash-meaning')).toHaveCount(0)
  const choices = await page.locator('.choice').allInnerTexts()
  expect(choices).toHaveLength(4)
  expect(new Set(choices).size).toBe(4)
  expect(choices.filter((c) => c === r)).toHaveLength(1)
  // the same showing keeps its choices across a reload
  await page.reload()
  await expect(page.locator('.choice')).toHaveCount(4)
  expect(await page.locator('.choice').allInnerTexts()).toEqual(choices)

  await page.waitForTimeout(READ_MS)
  const wrong = choices.find((c) => c !== r)!
  await page.locator('.choice', { hasText: new RegExp(`^${wrong}$`) }).click()
  await expect(page.locator('.choice.wrong')).toHaveText(wrong)
  await expect(page.locator('.choice.right')).toHaveText(r)
  await expect(page.locator('.choice:disabled')).toHaveCount(4)
  await expect(card).toHaveClass(/missed/)
  await expect(page.locator('.bridge')).toHaveText(`${w} = ${sk} → ${r}`)
  await expect(page.locator('.flash-meaning')).toHaveText(ko)
  await expect(page.locator('.sound-hints')).toContainText('받침')
  await expect(page.getByRole('button', { name: '발음 듣기' })).toBeVisible()
  // no "쉬워요" on a reading card
  await expect(page.getByRole('button', { name: /^쉬워요/ })).toHaveCount(0)
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^확인했어요 · 다음/ }).click()

  await expect.poll(async () => (await saved(page)).cards[L(`5-${idx}:r`)]?.state).toBe(1)
  const s = await saved(page)
  expect(s.cards[L(`5-${idx}`)]).toBeUndefined()
  expect(s.v).toBe(4)
  expect(s.log['2026-11-13']).toMatchObject({ c: 1, n: 1 })

  // the word sheet and level screen know the word type
  await page.goto('./#/level/5')
  await expect(page.locator('.fast-count')).toContainText('뜻 대신 읽기만 확인해요')
  await page.getByRole('button', { name: /^같은 한자어/ }).click()
  // the word counts as "익히는 중" through its reading card
  await page.getByRole('button', { name: '익히는 중', exact: true }).click()
  await expect(page.locator('.word-row')).toHaveCount(1)
  await page.locator('.word-row', { hasText: ko }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('.type-line')).toContainText(`한자어 · 뜻이 같아요 · ${sk}`)
  await expect(sheet.locator('.sheet-status')).toContainText('익히는 중 · 읽기 다음 복습')
})

test('the right reading moves on with "다음"; keys 1–4 choose', async ({ page }) => {
  const pos = firstOf('S')
  const idx = ORDER[pos]
  const r = N5[idx][1] as string
  await open(page, { state: user({ fastTrack: true, dailyNew: 1 }, { cards: seen(pos) }), hash: '/study' })
  await expect(page.locator('.choice')).toHaveCount(4)
  const choices = await page.locator('.choice').allInnerTexts()
  await page.waitForTimeout(READ_MS)
  await page.keyboard.press(String(choices.indexOf(r) + 1))
  await expect(page.locator('.choice.right')).toHaveText(r)
  await expect(page.locator('.choice.wrong')).toHaveCount(0)
  await expect(page.locator('#reading-prompt')).toHaveText('맞았어요')
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^다음/ }).click()
  await expect.poll(async () => (await saved(page)).cards[L(`5-${idx}:r`)]?.reps).toBe(1)
})

test('an F word warns after the reveal, not before, and on the word sheet', async ({ page }) => {
  const pos = firstOf('F')
  const idx = ORDER[pos]
  const [w, , , , , , , , ff] = N5[idx] as string[]
  await open(page, { state: user({ fastTrack: true, dailyNew: 1 }, { cards: seen(pos) }), hash: '/study' })
  await expect(page.locator('.flash-word')).toHaveText(w)
  await expect(page.locator('.flash.reading-card')).toHaveCount(0)
  await expect(page.locator('.false-friend')).toHaveCount(0)
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: '정답 보기' }).click()
  await expect(page.locator('.false-friend')).toContainText('한국어와 뜻이 달라요')
  await expect(page.locator('.false-friend')).toContainText(ff)

  await page.goto('./#/level/5')
  await page.getByRole('button', { name: /^뜻 다른 한자어/ }).click()
  await expect(page.locator('.word-row').first()).toBeVisible()
  await page.locator('.word-row', { hasText: w }).first().click()
  await expect(page.getByRole('dialog').locator('.false-friend')).toContainText(ff)
})

test('turning the fast-track off in settings: the S word comes as a meaning card, and back on as a reading card', async ({ page }) => {
  const pos = firstOf('S')
  const idx = ORDER[pos]
  await open(page, { state: user({ fastTrack: true, dailyNew: 3 }, { cards: seen(pos) }), hash: '/settings' })
  const toggle = page.getByRole('switch', { name: /한자어 빠른 통과/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await expect.poll(async () => (await saved(page)).settings.fastTrack).toBe(false)

  await page.goto('./#/study')
  await expect(page.locator('.flash-word')).toHaveText(N5[idx][0] as string)
  await expect(page.locator('.flash.reading-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '정답 보기' })).toBeVisible()

  await page.goto('./#/level/5')
  await expect(page.locator('.fast-count')).toContainText('한자어 빠른 통과가 꺼져 있어요')
  await page.goto('./#/settings')
  await page.getByRole('switch', { name: /한자어 빠른 통과/ }).check()
  await page.goto('./#/study')
  await expect(page.locator('.flash.reading-card')).toBeVisible()
})
