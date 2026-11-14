import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { homeShown, KEY, L, NOW, open, READ_MS, saved, user } from './fixtures'

const DAY = 86400_000
const review = (due: number) => ({ due, stability: 30, difficulty: 5, elapsed_days: 25, scheduled_days: 25, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 25 * DAY })
const manyCards = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`5-${i}`, review(NOW.getTime() + DAY)]))

async function downloadJson(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  return { name: download.suggestedFilename(), body: JSON.parse(await readFile((await download.path())!, 'utf8')) }
}

test.describe('error screen', () => {
  // a card that is not a card makes the home screen throw while rendering (an id outside every level no longer
  // does: since stable ids such a record is kept apart, see id-migration.spec.ts)
  const broken = () => user({ apiKey: 'sk-ant-secret' }, { xp: 33, cards: { '5-0': null } })

  test('a render error shows the recovery screen, which can export what is stored', async ({ page }) => {
    await open(page, { state: broken() })
    await expect(page.getByRole('heading', { name: '화면을 열지 못했어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible()
    const { name, body } = await downloadJson(page, () => page.getByRole('button', { name: '백업 내보내기' }).click())
    expect(name).toBe('jlpt-ruma-backup-2026-11-13.json')
    // the stored state was saved again after loading, migrated to v4 (fast-track, stable ids)
    expect(body).toMatchObject({ format: 'jlpt-luma-backup', v: 4, xp: 33 })
    expect(body.cards).toEqual({ [L('5-0')]: null }) // exactly what is stored, broken part included
    expect(body.settings).not.toHaveProperty('apiKey') // left by an older version: never exported
  })

  test('reset asks first, then starts over', async ({ page }) => {
    await open(page, { state: broken() })
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await page.getByRole('button', { name: '취소' }).click()
    expect((await saved(page)).xp).toBe(33)
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await expect(page.getByText('되돌릴 수 없어요.')).toBeVisible()
    await page.getByRole('button', { name: '모두 지우기' }).click()
    await expect(page.getByRole('group', { name: /어느 급수를 준비해요/ })).toBeVisible()
    expect(await saved(page)).toBeNull()
  })

  test('reload brings the app back once the cause is gone', async ({ page }) => {
    await open(page, { state: broken() })
    await expect(page.getByRole('heading', { name: '화면을 열지 못했어요' })).toBeVisible()
    // the stored (migrated) state is repaired
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ ...user(), v: 4 })])
    await page.getByRole('button', { name: '다시 불러오기' }).click()
    await homeShown(page)
  })
})

test.describe('saving fails', () => {
  async function failSaves(page: Page, fail: boolean) {
    await page.evaluate((f) => ((window as unknown as { __failSave: boolean }).__failSave = f), fail)
  }
  async function answerEasy(page: Page, left: number) {
    await page.waitForTimeout(READ_MS)
    await page.locator('.flash').click()
    await page.getByRole('button', { name: /^쉬워요/ }).click()
    await expect(page.locator('.left-count')).toHaveText(`${left}장 남음`)
  }

  test('warns once, offers a backup, and warns again only after a save has worked', async ({ page }) => {
    await page.addInitScript((k) => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if ((window as unknown as { __failSave?: boolean }).__failSave && key === k) throw new DOMException('quota', 'QuotaExceededError')
        return set.call(this, key, value)
      }
    }, KEY)
    await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
    const warning = page.getByRole('alert')
    await failSaves(page, true)
    await answerEasy(page, 4)
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('기록을 이 기기에 저장하지 못했어요.')

    // the backup holds the progress that could not be saved
    const { body } = await downloadJson(page, () => warning.getByRole('button', { name: '백업 내보내기' }).click())
    expect(Object.keys(body.cards)).toHaveLength(1)

    await warning.getByRole('button', { name: '경고 닫기' }).click()
    await expect(warning).toBeHidden()
    await answerEasy(page, 3)
    await expect(warning).toBeHidden() // same run of failures: no spam

    await failSaves(page, false)
    await answerEasy(page, 2)
    expect(Object.keys((await saved(page)).cards)).toHaveLength(3)
    await failSaves(page, true)
    await answerEasy(page, 1)
    await expect(warning).toBeVisible()
  })
})

test.describe('backups', () => {
  test('import can be undone in the same session', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({ target: 3 }, { xp: 999 }))) })
    await page.getByRole('button', { name: '백업으로 바꾸기' }).click()
    await expect(page.getByText('백업 파일의 기록으로 바꿨어요.')).toBeVisible()
    expect((await saved(page)).xp).toBe(999)
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('kasane.state.prev')))!).xp).toBe(5)

    await page.getByRole('button', { name: '가져오기 되돌리기' }).click()
    await expect(page.getByText('백업 파일의 기록으로 바꿨어요.')).toBeHidden()
    expect((await saved(page)).xp).toBe(5)
    await expect(page.getByRole('radio', { name: 'N5' })).toBeChecked()
  })

  test('export is versioned and a versioned file imports; a newer format is refused', async ({ page }) => {
    await open(page, { state: user({}, { xp: 77 }), hash: '/settings' })
    await expect(page.getByText('백업한 적이 없어요.')).toBeVisible()
    const { body } = await downloadJson(page, () => page.getByRole('button', { name: '백업 내보내기' }).click())
    expect(body).toMatchObject({ format: 'jlpt-luma-backup', formatVersion: 3, v: 4, xp: 77 })
    expect(typeof body.app).toBe('string')
    await expect(page.getByText('마지막 백업 2026년 11월 13일')).toBeVisible()

    await page.locator('input[type=file]').setInputFiles({ name: 'n.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...body, formatVersion: 4, xp: 1 })) })
    const d = page.getByRole('dialog', { name: '가져오지 못했어요' })
    await expect(d).toContainText('새 버전의 앱에서 만든 백업이에요. 앱을 새로고침한 뒤 가져와 주세요.')
    await d.getByRole('button', { name: '알겠어요' }).click()

    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...body, xp: 78 })) })
    await page.getByRole('button', { name: '백업으로 바꾸기' }).click()
    await expect.poll(async () => (await saved(page)).xp).toBe(78)
    const s = await saved(page)
    for (const k of ['format', 'formatVersion', 'app', 'exportedAt']) expect(s).not.toHaveProperty(k)
  })

  test('the backup reminder waits in 설정 (a dot on the tab while it is due) and can be dismissed; home stays calm', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(30) }) })
    await homeShown(page)
    await expect(page.locator('.nudge')).toHaveCount(0)
    const tab = page.locator('.tabbar').getByRole('link', { name: '설정, 백업 권유 있음' })
    await expect(tab.locator('.tab-dot')).toBeVisible()
    await tab.click()
    const nudge = page.locator('.nudge')
    await expect(nudge).toContainText('백업할 때예요.')
    await nudge.getByRole('button', { name: '백업 알림 닫기' }).click()
    await expect(nudge).toBeHidden()
    await expect(page.locator('.tab-dot')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible()
    await expect(nudge).toBeHidden()
    await expect(page.locator('.tabbar').getByRole('link', { name: '설정', exact: true })).toBeVisible()
  })

  test('backing up from the reminder hides it', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(30) }), hash: '/settings' })
    const nudge = page.locator('.nudge')
    await downloadJson(page, () => nudge.getByRole('button', { name: '백업하기' }).click())
    await expect(nudge).toBeHidden()
    await expect(page.locator('.tab-dot')).toHaveCount(0)
  })

  test('no reminder without real progress', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(5) }), hash: '/settings' })
    await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible()
    await expect(page.locator('.nudge')).toHaveCount(0)
    await expect(page.locator('.tab-dot')).toHaveCount(0)
  })

  test('persistent storage is requested once the first day is finished', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __persist: number }
      w.__persist = 0
      Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: () => (w.__persist++, Promise.resolve(true)) } })
    })
    await open(page, { state: user({ dailyNew: 2 }), hash: '/study' })
    const calls = () => page.evaluate(() => (window as unknown as { __persist: number }).__persist)
    for (let left = 1; left >= 0; left--) {
      await page.waitForTimeout(READ_MS)
      await page.locator('.flash').click()
      await page.getByRole('button', { name: /^쉬워요/ }).click()
      if (left) expect(await calls()).toBe(0)
    }
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    await expect.poll(calls).toBe(1)
  })
})

test('word data that fails to load once: “다시 시도” loads it again and the session starts', async ({ page }) => {
  // the studied levels' data (the queue's order and fast-track words): the first request fails, later ones go through
  let failures = 0
  await page.route('**/data/words-n5.json', (r) => (failures++ === 0 ? r.fulfill({ status: 503, body: 'unavailable' }) : r.fallback()))
  await open(page, { state: user({ includeLower: true }), hash: '/study' })
  await expect(page.getByRole('alert')).toContainText('단어 데이터를 불러오지 못했어요 (N5)')
  await expect(page.locator('.flash')).toHaveCount(0)
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.locator('.flash')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(failures).toBe(2)
})
