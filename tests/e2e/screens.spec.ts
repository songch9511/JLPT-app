import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { homeShown, L, NOW, open, saved, user } from './fixtures'

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
    // nothing typed: no list and no empty-state message, only the search field
    await expect(page.getByRole('searchbox', { name: '단어 검색' })).toBeVisible()
    await expect(page.locator('.word-row')).toHaveCount(0)
    await expect(page.locator('.empty')).toHaveCount(0)
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
    expect((await saved(page)).marks).toEqual([L('5-452')])
    // the list tabs are a segmented control (a radio group)
    await page.getByRole('radio', { name: /^북마크/ }).click()
    await expect(page.locator('.word-row')).toHaveCount(1)
    await expect(page.locator('.word-row')).toContainText('学校')
  })

  test('no results and the result cap', async ({ page }) => {
    await open(page, { state: user(), hash: '/words' })
    const box = page.getByPlaceholder('일본어, 읽기, 뜻으로 검색')
    await box.fill('zzzzqqq')
    await expect(page.getByRole('heading', { name: '찾는 단어가 없어요' })).toBeVisible()
    await box.fill('a')
    await expect(page.locator('.word-row')).toHaveCount(60)
  })

  test('weak words list shows cards forgotten twice or more', async ({ page }) => {
    const cards = { '5-1': review(NOW.getTime() + DAY, { lapses: 3 }), '5-2': review(NOW.getTime() + DAY, { lapses: 1 }) }
    await open(page, { state: user({}, { cards }), hash: '/words' })
    await page.getByRole('radio', { name: /^약한 단어/ }).click()
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
    await page.getByRole('button', { name: '더 보기 · 618개 남음' }).click()
    await expect(page.locator('.word-row')).toHaveCount(200)
    for (const [label, n] of [['장기 기억', 1], ['다지는 중', 1], ['익히는 중', 1]] as const) {
      await page.getByRole('group', { name: '기억 단계' }).getByRole('button', { name: label }).click()
      await expect(page.locator('.word-row')).toHaveCount(n)
    }
    await page.getByRole('group', { name: '기억 단계' }).getByRole('button', { name: '새 단어' }).click()
    await expect(page.locator('.word-row')).toHaveCount(100)
  })

  test('empty filter message and “목표로 설정”', async ({ page }) => {
    await open(page, { state: user(), hash: '/level/3' })
    await page.getByRole('group', { name: '기억 단계' }).getByRole('button', { name: '장기 기억' }).click()
    await expect(page.getByRole('heading', { name: '해당하는 단어가 없어요' })).toBeVisible()
    await page.getByRole('button', { name: '목표로 설정' }).click()
    await expect(page.locator('.top').getByText('목표 급수', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '목표로 설정' })).toHaveCount(0)
    await page.getByRole('link', { name: '뒤로' }).click()
    // the level rows live on the 단어장 tab now
    await expect(page.getByRole('heading', { name: '급수별 기억 상태' })).toBeVisible()
    await expect(page.locator('.level-row.target .level-name b')).toHaveText('N3')
  })

  test('garbage hash routes fall back to home', async ({ page }) => {
    await open(page, { state: user() })
    for (const h of ['#/level/9', '#/level/', '#/level/05', '#/nope', '#%%%', '#/../settings']) {
      await page.evaluate((x) => (location.hash = x), h)
      await expect(page.getByRole('heading', { name: '오늘의 계획' }), h).toBeVisible()
    }
    // trailing segments after a valid route are ignored
    await page.evaluate(() => (location.hash = '#/level/4/extra'))
    await expect(page.getByRole('heading', { name: 'JLPT N4' })).toBeVisible()
  })
})

test.describe('settings', () => {
  test('target level, daily new words and theme apply and persist', async ({ page }) => {
    await open(page, { state: user({ theme: 'system' }), hash: '/settings' })
    await page.getByRole('radio', { name: 'N2' }).click()
    await page.getByRole('radio', { name: '30', exact: true }).click()
    await page.getByRole('radio', { name: '다크' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.locator('.home-head .subtitle b')).toHaveText('N2')
    await expect(page.locator('.plan-counts .c-new b')).toHaveText('30')
    await page.getByRole('link', { name: '설정' }).click()
    await page.getByRole('radio', { name: '시스템' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  })

  test('an API key saved by an older version is dropped and never exported; import restores a backup', async ({ page }) => {
    await open(page, { state: user({ apiKey: 'sk-ant-secret' }, { xp: 77, marks: ['5-3'] }), hash: '/settings' })
    // no API key field any more
    await expect(page.getByText(/API 키/)).toHaveCount(0)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 내보내기' }).click()])
    expect(download.suggestedFilename()).toBe('jlpt-ruma-backup-2026-11-13.json')
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(backup.settings).not.toHaveProperty('apiKey')
    expect(backup.xp).toBe(77)

    // change things, then import the backup back
    await page.getByRole('radio', { name: 'N1' }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    // the in-app confirmation (no browser confirm())
    await page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' }).getByRole('button', { name: '백업으로 바꾸기' }).click()
    await expect(page.getByRole('radio', { name: 'N5' })).toBeChecked()
    const s = await saved(page)
    expect(s.xp).toBe(77)
    expect(JSON.stringify(s)).not.toContain('sk-ant-secret')
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
      await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) })
      // an in-app message (no browser alert())
      const d = page.getByRole('dialog', { name: '가져오지 못했어요' })
      await expect(d, body).toBeVisible()
      await expect(d).toContainText('JLPT 루마 백업 파일이 아니에요.')
      await d.getByRole('button', { name: '알겠어요' }).click()
      await expect(d).toBeHidden()
    }
    expect((await saved(page)).xp).toBe(5)
    await page.getByRole('link', { name: '홈' }).click()
    await homeShown(page)
  })

  test('declining the import confirmation changes nothing', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({}, { xp: 999 }))) })
    await page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' }).getByRole('button', { name: '취소' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await page.waitForTimeout(300)
    expect((await saved(page)).xp).toBe(5)
  })

  test('reset asks first, then starts the first run again', async ({ page }) => {
    await open(page, { state: user({}, { xp: 50 }), hash: '/settings' })
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    const ask = page.getByRole('alertdialog', { name: '모든 기록을 지울까요?' })
    await expect(ask).toContainText('되돌릴 수 없어요')
    await ask.getByRole('button', { name: '취소' }).click()
    await expect(ask).toBeHidden()
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
    expect((await saved(page)).xp).toBe(50)
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await ask.getByRole('button', { name: '모두 지우기' }).click()
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('button', { name: 'N5' })).toBeVisible()
    expect((await saved(page)).onboarded).toBe(false)
  })
})

test('P9: home never offers more than 40 new words a day and gives no pace advice; the pace is a setting', async ({ page }) => {
  // the old “맞추기” link offered 100 a day, and a later lever pushed the pace towards an exam-day goal
  await open(page, { state: user({ target: 1, dailyNew: 100 }) })
  await homeShown(page)
  await expect(page.locator('.plan-counts .c-new b')).toHaveText('40')
  await expect(page.getByRole('button', { name: /맞추기|바꾸기/ })).toHaveCount(0)
  await expect(page.locator('.plan-lever')).toHaveCount(0)
  await expect(page.getByText(/목표에 닿아요|목표를|시험/)).toHaveCount(0)
})

test('settings: daily new words stop at 40; lower levels can be set; no exam date or goal; the unofficial notice is shown', async ({ page }) => {
  await open(page, { state: user({ target: 3, dailyNew: 100 }), hash: '/settings' })
  // an old value above the cap is held to it
  await expect(page.getByRole('radio', { name: '40', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: '50', exact: true })).toHaveCount(0)
  const lower = page.getByRole('switch', { name: /아래 급수 단어도 함께 \(N5·N4\)/ })
  await expect(lower).not.toBeChecked()
  await lower.check()
  await expect.poll(async () => (await saved(page)).settings).toMatchObject({ includeLower: true, dailyNew: 40 })
  // the exam date (chips, date field) and the exam-day goal are gone
  await expect(page.getByRole('radio', { name: '90%' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '시험일' })).toHaveCount(0)
  await expect(page.locator('input[type="date"]')).toHaveCount(0)
  await expect(page.getByText(/시험일|시험날|준비도/)).toHaveCount(0)
  expect((await saved(page)).settings).not.toHaveProperty('goal')
  await expect(page.locator('.about .unofficial')).toContainText('관계없는 비공식 학습 앱')
  await expect(page.locator('.about .unofficial')).toContainText('승인하거나 후원하지 않아요')
})

test('P4: with lower levels included an N3 learner meets N5 words first, and the card says which level', async ({ page }) => {
  await open(page, { state: user({ target: 3, includeLower: true }) })
  await expect(page.getByRole('link', { name: /^N5~N3 단어 3,526개 중 0개 만남/ })).toBeVisible()
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  // the card's facts line names the level, as plain text joined by " · "
  await expect(page.locator('.flash-head .flash-meta')).toHaveText(/(^| · )N5$/)
})

test.describe('home: Ruma, today’s plan, then the words met', () => {
  test('an established learner: the sky with the day, level, Ruma and the week; the plan sheet with its one primary; the words met; nothing about an exam', async ({ page }) => {
    const t = NOW.getTime()
    const cards = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`5-${i}`, review(t + ((i % 20) - 5) * DAY, { stability: 10 + (i % 30) })]))
    await open(page, { state: user({}, { cards, log: { '2026-11-12': { c: 60, n: 0, r: 40, p: 36 } } }) })
    await homeShown(page)
    await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeVisible()
    await expect(page.locator('.home-head .subtitle')).toHaveText('11월 13일 금요일 · N5')
    await expect(page.getByRole('img', { name: '연속 1일, 오늘 하면 2일' })).toHaveText('1')
    // order: the sky (header, Ruma, its line, the week), then the plan sheet (figure, button, the words met)
    const sky = page.locator('main.page > .home-sky')
    await expect(sky.locator(':scope > :not(.waves)')).toHaveClass([/home-head/, /sky-ruma/, /ruma-line/, /seals/])
    await expect(sky.getByRole('img', { name: '이번 주 1일 공부함' })).toBeVisible()
    const plan = page.locator('main.page > .home-sheet')
    await expect(plan).toHaveAccessibleName('오늘의 계획')
    const words = plan.getByRole('link', { name: 'N5 단어 718개 중 200개 만남, 기록 보기' })
    await expect(words).toHaveAttribute('href', '#/stats')
    await expect(words.locator('.home-words-text')).toHaveText('만난 단어200 / 718')
    // what left home: the long-term-memory line, the weak-words and 기록 rows (both are tabs), the quest
    await expect(page.getByText(/장기 기억|약한 단어|오늘 분량 끝내기|읽기만/)).toHaveCount(0)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
    // the start button stays in the first screen
    const box = await page.getByRole('button', { name: /^오늘의 학습 시작, \d+장$/ }).boundingBox()
    expect(box!.y + box!.height).toBeLessThan(844 - 70)
    await expect(page.getByText(/시험|D-\d|예상|목표에 닿아요|합격/)).toHaveCount(0)
    // the weak words and the records are a tab away
    await page.locator('.tabbar').getByRole('link', { name: '단어장' }).click()
    await expect(page.getByRole('radio', { name: /^약한 단어/ })).toBeVisible()
  })

  test('the 기록 tab holds the stamps, forecast and heatmap that left home', async ({ page }) => {
    await open(page, { state: user({}, { xp: 1234 }) })
    await expect(page.locator('.heatmap')).toHaveCount(0)
    await page.locator('.tabbar').getByRole('link', { name: '기록' }).click()
    await expect(page.getByRole('heading', { name: '기록', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: /도장 여정/ })).toBeVisible()
    await expect(page.locator('.heatmap')).toBeVisible()
    await expect(page.locator('.forecast-chart')).toBeVisible()
    await expect(page.locator('.stat-grid')).toContainText('1,234')
  })
})

test('no AI entry points are left: study card, word sheet and weak words', async ({ page }) => {
  const leech = review(NOW.getTime() + DAY, { lapses: 3 })
  await open(page, { state: user({ apiKey: 'sk-ant-old' }, { cards: { '5-1': leech } }), hash: '/words' })
  await page.getByRole('radio', { name: /^약한 단어/ }).click()
  await expect(page.getByText(/이야기/)).toHaveCount(0)
  await page.getByRole('radio', { name: /^검색/ }).click()
  await page.getByPlaceholder('일본어, 읽기, 뜻으로 검색').fill('学校')
  await page.locator('.word-row').filter({ hasText: 'がっこう' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/AI/)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.evaluate(() => (location.hash = '#/study'))
  await page.getByRole('button', { name: '정답 보기' }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  await expect(page.getByText(/AI/)).toHaveCount(0)
  expect(JSON.stringify(await saved(page))).not.toContain('sk-ant-old')
})
