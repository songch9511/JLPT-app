import { expect, type Page } from '@playwright/test'

export const KEY = 'kasane.state.v2'
/** Friday 2026-11-13 09:00 in Seoul (the browser context runs in Asia/Seoul). */
export const NOW = new Date('2026-11-13T09:00:00+09:00')

type Settings = { target: number; examDate: string; dailyNew: number; theme: string; autoSpeak: boolean; includeLower: boolean; goal: number }

/**
 * A saved state as an existing learner has it. Without `includeLower` it is a learner from before that
 * setting: only the target level is studied (pass `includeLower: true` for a new learner's behaviour).
 */
export function user(settings: Partial<Settings> & Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    v: 2,
    onboarded: true,
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 10, theme: 'light', autoSpeak: false, ...settings },
    cards: {},
    log: {},
    marks: [],
    xp: 0,
    ...extra,
  }
}

/**
 * Open the app with a fake clock and, optionally, a saved state. The state is written only on the
 * first load of the tab, so reloads see whatever the app saved since.
 */
export async function open(page: Page, opts: { state?: unknown; time?: Date; hash?: string } = {}) {
  await page.clock.install({ time: opts.time ?? NOW })
  if (opts.state !== undefined)
    await page.addInitScript(
      ([k, v]) => {
        if (!sessionStorage.getItem('e2e-seeded')) {
          localStorage.setItem(k, v)
          sessionStorage.setItem('e2e-seeded', '1')
        }
      },
      [KEY, JSON.stringify(opts.state)],
    )
  await page.goto(opts.hash ? `./#${opts.hash}` : './')
}

export const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)

export const todayLog = async (page: Page, day = '2026-11-13') => (await saved(page))?.log?.[day]

/**
 * Answers within this long of the previous one are ignored as double taps (Study.tsx), so the tests
 * pause like a person reading the card would.
 */
export const READ_MS = 400

/** Reveal the current card and answer it. */
export async function answer(page: Page, choice: '알아요' | '쉬워요' | '모르겠어요' = '알아요') {
  const card = page.locator('.flash')
  await expect(card).toBeVisible()
  await page.waitForTimeout(READ_MS)
  const before = (await todayLog(page))?.c ?? 0
  if (choice === '모르겠어요') {
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: '확인했어요 · 다음' }).click()
  } else {
    await card.click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${choice}`) }).click()
  }
  await expect.poll(async () => (await todayLog(page))?.c ?? 0).toBe(before + 1)
}

/** The home screen has rendered (its headline is the exam readiness card). */
export const homeShown = (page: Page) => expect(page.getByRole('heading', { name: /시험날 기억할 단어/ })).toBeVisible()

/** Current word on the study card. */
export const currentWord = (page: Page) => page.locator('.flash-word').innerText()
