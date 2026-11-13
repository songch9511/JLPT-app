import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { NOW, open, saved, user } from './fixtures'

const DAY = 86400_000
const review = (due: number, extra: Record<string, number> = {}) => ({
  due,
  stability: 30,
  difficulty: 5,
  elapsed_days: 25,
  scheduled_days: 25,
  learning_steps: 0,
  reps: 5,
  lapses: 0,
  state: 2,
  last_review: due - 25 * DAY,
  ...extra,
})

test.describe('words', () => {
  test('search, open the word sheet, bookmark, close with Escape', async ({ page }) => {
    await open(page, { state: user(), hash: '/words' })
    await expect(page.getByText('N5부터 N1까지 8,130개 단어에서 찾아요.')).toBeVisible()
    const box = page.getByPlaceholder('일본어, 읽기, 뜻으로 검색')
    for (const q of ['学校', 'がっこう', '학교', 'SCHOOL']) {
      await box.fill(q)
      await expect(page.locator('.word-row').filter({ hasText: '学校' }).first()).toBeVisible()
    }
    await box.fill('学校')
    await page.locator('.word-row').filter({ hasText: 'がっこう' }).first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.locator('.sheet-word')).toHaveText('学校')
    await expect(sheet.locator('.sheet-reading')).toHaveText('がっこう')
    await expect(sheet.locator('.sheet-meaning')).toHaveText('학교')
    await expect(sheet).toContainText('새 단어')
    await sheet.getByRole('button', { name: '북마크' }).click()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    expect((await saved(page)).marks).toEqual(['5-452'])
    await page.getByRole('button', { name: /^북마크/ }).click()
    await expect(page.locator('.word-row')).toHaveCount(1)
    await expect(page.locator('.word-row')).toContainText('学校')
  })

  test('no results and the result cap', async ({ page }) => {
    await open(page, { state: user(), hash: '/words' })
    const box = page.getByPlaceholder('일본어, 읽기, 뜻으로 검색')
    await box.fill('zzzzqqq')
    await expect(page.getByText('찾는 단어가 없어요.')).toBeVisible()
    await box.fill('a')
    await expect(page.locator('.word-row')).toHaveCount(60)
  })

  test('weak words list shows cards forgotten twice or more', async ({ page }) => {
    const cards = { '5-1': review(NOW.getTime() + DAY, { lapses: 3 }), '5-2': review(NOW.getTime() + DAY, { lapses: 1 }) }
    await open(page, { state: user({}, { cards }), hash: '/words' })
    await page.getByRole('button', { name: /^약한 단어/ }).click()
    await expect(page.locator('.word-row')).toHaveCount(1)
    await expect(page.locator('.word-row')).toContainText('3번 잊음')
  })
})

test.describe('level screen', () => {
  test('breakdown and stage filters', async ({ page }) => {
    const t = NOW.getTime()
    const cards = {
      '5-0': review(t + DAY), // mature (25 days)
      '5-1': review(t + DAY, { scheduled_days: 3 }), // young
      '5-2': { ...review(t + 60_000), state: 1, scheduled_days: 0 }, // learning
    }
    await open(page, { state: user({}, { cards }), hash: '/level/5' })
    await expect(page.getByRole('heading', { name: 'JLPT N5' })).toBeVisible()
    await expect(page.locator('.breakdown .mature b')).toHaveText('1')
    await expect(page.locator('.breakdown .young b')).toHaveText('1')
    await expect(page.locator('.breakdown .learning b')).toHaveText('1')
    await expect(page.locator('.breakdown .new b')).toHaveText('715')
    await expect(page.locator('.word-row')).toHaveCount(100)
    await page.getByRole('button', { name: /더 보기 \(618개 남음\)/ }).click()
    await expect(page.locator('.word-row')).toHaveCount(200)
    for (const [label, n] of [['장기 기억', 1], ['다지는 중', 1], ['익히는 중', 1]] as const) {
      await page.locator('.seg.scroll').getByRole('button', { name: label }).click()
      await expect(page.locator('.word-row')).toHaveCount(n)
    }
    await page.locator('.seg.scroll').getByRole('button', { name: '새 단어' }).click()
    await expect(page.locator('.word-row')).toHaveCount(100)
  })

  test('empty filter message and “목표로 설정”', async ({ page }) => {
    await open(page, { state: user(), hash: '/level/3' })
    await page.locator('.seg.scroll').getByRole('button', { name: '장기 기억' }).click()
    await expect(page.getByText('여기에 해당하는 단어가 아직 없어요.')).toBeVisible()
    await page.getByRole('button', { name: '목표로 설정' }).click()
    await expect(page.locator('.top .chip.accent')).toHaveText('목표 급수')
    await page.getByRole('link', { name: '뒤로' }).click()
    await expect(page.getByText('N3 여정')).toBeVisible()
  })

  test('garbage hash routes fall back to home', async ({ page }) => {
    await open(page, { state: user() })
    for (const h of ['#/level/9', '#/level/', '#/level/05', '#/nope', '#%%%', '#/../settings']) {
      await page.evaluate((x) => (location.hash = x), h)
      await expect(page.getByText('N5 여정'), h).toBeVisible()
    }
    // trailing segments after a valid route are ignored
    await page.evaluate(() => (location.hash = '#/level/4/extra'))
    await expect(page.getByRole('heading', { name: 'JLPT N4' })).toBeVisible()
  })
})

test.describe('settings', () => {
  test('target level, daily new words and theme apply and persist', async ({ page }) => {
    await open(page, { state: user({ theme: 'system' }), hash: '/settings' })
    await page.getByRole('button', { name: 'N2' }).click()
    await page.getByRole('button', { name: '30', exact: true }).click()
    await page.getByRole('button', { name: '다크' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByText('N2 여정')).toBeVisible()
    await expect(page.locator('.hero-counts .c-new b')).toHaveText('30')
    await page.getByRole('link', { name: '설정' }).click()
    await page.getByRole('button', { name: '시스템' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  })

  test('export leaves out the API key; import restores a backup', async ({ page }) => {
    await open(page, { state: user({ apiKey: 'sk-ant-secret' }, { xp: 77, marks: ['5-3'] }), hash: '/settings' })
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 내보내기' }).click()])
    expect(download.suggestedFilename()).toBe('kasane-backup-2026-11-13.json')
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(backup.settings.apiKey).toBe('')
    expect(backup.xp).toBe(77)

    // change things, then import the backup back
    await page.getByRole('button', { name: 'N1' }).click()
    page.once('dialog', (d) => d.accept())
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await expect(page.getByRole('button', { name: 'N5' })).toHaveClass('on')
    const s = await saved(page)
    expect(s.xp).toBe(77)
    expect(s.settings.apiKey).toBe('sk-ant-secret') // the key on this device is kept
  })

  test('import rejects files that are not backups, and malformed backups that would break the app', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    const bad = [
      'not json',
      JSON.stringify({ hello: 1 }),
      JSON.stringify({ ...user(), cards: { '5-0': null } }),
      JSON.stringify({ ...user(), log: null }),
    ]
    for (const body of bad) {
      const msg = page.waitForEvent('dialog')
      await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) })
      const d = await msg
      expect(d.type(), body).toBe('alert')
      expect(d.message()).toBe('카사네 백업 파일이 아니에요.')
      await d.accept()
    }
    expect((await saved(page)).xp).toBe(5)
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByText('N5 여정')).toBeVisible()
  })

  test('declining the import confirmation changes nothing', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    page.once('dialog', (d) => d.dismiss())
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({}, { xp: 999 }))) })
    await page.waitForTimeout(300)
    expect((await saved(page)).xp).toBe(5)
  })

  test('reset asks first, then returns to onboarding', async ({ page }) => {
    await open(page, { state: user({}, { xp: 50 }), hash: '/settings' })
    page.once('dialog', (d) => d.dismiss())
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
    expect((await saved(page)).xp).toBe(50)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible()
    expect((await saved(page)).onboarded).toBe(false)
  })

  test('an exam date in the past is reported, not crashed on', async ({ page }) => {
    await open(page, { state: user({ examDate: '2026-07-05' }) })
    await expect(page.locator('.dday')).toHaveText('시험일 지남 · 바꾸기')
    await expect(page.getByText('시험일이 지났어요. 설정에서 다음 시험일을 골라 주세요.')).toBeVisible()
  })
})

test('the pace link never offers to change 100 to 100', async ({ page }) => {
  // N1: 2,699 words, 23 days to the exam → 118 a day, capped at 100
  await open(page, { state: user({ target: 1, dailyNew: 20, examDate: '2026-12-06' }) })
  await page.getByRole('button', { name: '지금 하루 20개 → 100개로 맞추기' }).click()
  await expect(page.getByText('시험 전에 전부 만나려면 하루 새 단어 118개')).toBeVisible()
  await expect(page.getByRole('button', { name: /맞추기/ })).toHaveCount(0)
  expect((await saved(page)).settings.dailyNew).toBe(100)
})
