import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { homeShown, KEY, NOW, open, READ_MS, saved, user } from './fixtures'

const DAY = 86400_000
const review = (due: number) => ({ due, stability: 30, difficulty: 5, elapsed_days: 25, scheduled_days: 25, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 25 * DAY })
const manyCards = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`5-${i}`, review(NOW.getTime() + DAY)]))

async function downloadJson(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  return { name: download.suggestedFilename(), body: JSON.parse(await readFile((await download.path())!, 'utf8')) }
}

test.describe('error screen', () => {
  // a card id outside every level makes the home screen throw while rendering
  const broken = () => user({ apiKey: 'sk-ant-secret' }, { xp: 33, cards: { '9-0': review(NOW.getTime()) } })

  test('a render error shows the recovery screen, which can export what is stored', async ({ page }) => {
    await open(page, { state: broken() })
    await expect(page.getByRole('heading', { name: '화면을 여는 중에 문제가 생겼어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible()
    const { name, body } = await downloadJson(page, () => page.getByRole('button', { name: '백업 내보내기' }).click())
    expect(name).toBe('jlpt-ruma-backup-2026-11-13.json')
    expect(body).toMatchObject({ format: 'jlpt-luma-backup', v: 2, xp: 33 })
    expect(body.cards['9-0']).toBeTruthy() // exactly what is stored, broken part included
    expect(body.settings).not.toHaveProperty('apiKey') // left by an older version: never exported
  })

  test('reset asks first, then starts over', async ({ page }) => {
    await open(page, { state: broken() })
    await page.getByRole('button', { name: /모든 기록 지우고/ }).click()
    await page.getByRole('button', { name: '취소' }).click()
    expect((await saved(page)).xp).toBe(33)
    await page.getByRole('button', { name: /모든 기록 지우고/ }).click()
    await expect(page.getByText('되돌릴 수 없어요.')).toBeVisible()
    await page.getByRole('button', { name: '모두 지우기' }).click()
    await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible()
    expect(await saved(page)).toBeNull()
  })

  test('reload brings the app back once the cause is gone', async ({ page }) => {
    await open(page, { state: broken() })
    await expect(page.getByRole('heading', { name: '화면을 여는 중에 문제가 생겼어요' })).toBeVisible()
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(user())])
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
    await expect(page.locator('.left-count')).toHaveText(`남은 ${left}장`)
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
    const warning = page.locator('.save-warning')
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
    page.once('dialog', (d) => d.accept())
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({ target: 3 }, { xp: 999 }))) })
    await expect(page.getByText('백업 파일의 기록으로 바꿨어요.')).toBeVisible()
    expect((await saved(page)).xp).toBe(999)
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('kasane.state.prev')))!).xp).toBe(5)

    await page.getByRole('button', { name: '가져오기 되돌리기' }).click()
    await expect(page.getByText('백업 파일의 기록으로 바꿨어요.')).toBeHidden()
    expect((await saved(page)).xp).toBe(5)
    await expect(page.getByRole('button', { name: 'N5' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('export is versioned and a versioned file imports; a newer format is refused', async ({ page }) => {
    await open(page, { state: user({}, { xp: 77 }), hash: '/settings' })
    await expect(page.getByText('아직 백업한 적이 없어요.')).toBeVisible()
    const { body } = await downloadJson(page, () => page.getByRole('button', { name: '백업 내보내기' }).click())
    expect(body).toMatchObject({ format: 'jlpt-luma-backup', formatVersion: 1, v: 2, xp: 77 })
    expect(typeof body.app).toBe('string')
    await expect(page.getByText('마지막 백업: 2026년 11월 13일')).toBeVisible()

    const newer = page.waitForEvent('dialog')
    await page.locator('input[type=file]').setInputFiles({ name: 'n.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...body, formatVersion: 2, xp: 1 })) })
    const d = await newer
    expect(d.message()).toContain('더 새로운 버전')
    await d.accept()

    page.once('dialog', (x) => x.accept())
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...body, xp: 78 })) })
    await expect.poll(async () => (await saved(page)).xp).toBe(78)
    const s = await saved(page)
    for (const k of ['format', 'formatVersion', 'app', 'exportedAt']) expect(s).not.toHaveProperty(k)
  })

  test('home shows a dismissible backup reminder once there is progress worth keeping', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(30) }) })
    const nudge = page.locator('.nudge')
    await expect(nudge).toContainText('백업해 두세요')
    await nudge.getByRole('button', { name: '백업 알림 닫기' }).click()
    await expect(nudge).toBeHidden()
    await page.reload()
    await homeShown(page)
    await expect(nudge).toBeHidden()
  })

  test('backing up from the reminder hides it', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(30) }) })
    const nudge = page.locator('.nudge')
    await downloadJson(page, () => nudge.getByRole('button', { name: '백업하기' }).click())
    await expect(nudge).toBeHidden()
  })

  test('no reminder without real progress', async ({ page }) => {
    await open(page, { state: user({}, { cards: manyCards(5) }) })
    await homeShown(page)
    await expect(page.locator('.nudge')).toHaveCount(0)
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
    await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
    await expect.poll(calls).toBe(1)
  })
})
