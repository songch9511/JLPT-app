#!/usr/bin/env node
// Draft App Store screenshots for JLPT 루마 (docs/store/screenshots.md).
//
// Builds the web app, serves it with `vite preview` on a free port, seeds localStorage with a simulated
// learner, and captures raw app screens (no captions, no device frame) at the App Store pixel sizes.
//
//   node docs/store/capture.mjs [--root <checkout>] [--out <dir>] [--port <n>] [--skip-build] [--only <name,...>]
//
// --root   the checkout to build and serve (default: the repository this file is in). Point it at a clean
//          `git worktree` when the working tree is in the middle of other changes.
// --out    where the PNGs go (default: $STORE_SHOTS_OUT or ./store-shots)
// --port   preview port (default: a free port)
//
// Chromium: Playwright's bundled browser (PLAYWRIGHT_BROWSERS_PATH); set PW_CHROMIUM to use another binary.
// Never runs `playwright install`.
//
// The learner is simulated with ts-fsrs (the app's own scheduler library) day by day, so card states, the
// daily log and the exam-day estimate are the kind the app would produce itself. Nothing here is a mock-up:
// every screen is the real app rendering seeded data.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createEmptyCard, fsrs, generatorParameters, Rating, State as CardState } from 'ts-fsrs'

// ── arguments ──────────────────────────────────────────────────────────────────────────────────────────────
const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const ROOT = path.resolve(arg('root', path.join(here, '..', '..')))
const OUT = path.resolve(arg('out', process.env.STORE_SHOTS_OUT ?? 'store-shots'))
const SKIP_BUILD = args.includes('--skip-build')
const ONLY = arg('only', '')
  .split(',')
  .filter(Boolean)

/**
 * App Store Connect iPhone sizes (checked 2026-11-14, screenshot-specifications page):
 * 6.9" Dynamic Island large 1320×2868, 6.3" Dynamic Island medium 1206×2622 (the required class).
 * Both are exact multiples of a 3× CSS viewport.
 */
const SIZES = [
  { name: '6.9in-1320x2868', width: 440, height: 956, scale: 3 },
  { name: '6.3in-1206x2622', width: 402, height: 874, scale: 3 },
]

// ── the word data of this checkout ─────────────────────────────────────────────────────────────────────────
// Words are named by their stable ids (`w000`, docs/plan/08 §7), read from the generated data files
// public/data/words-n{l}.json (each row starts with its id), and checked against the generated id table, so a
// card in the seed is exactly the card the app would make. Never derived from a word's position.
const READING = ':r'

/** The generated id table's runs [first counter, how many, level]: which level the app files each id under. */
const ID_RUNS = JSON.parse(/export const ID_RUNS[^=]*= (\[.*\])\s*$/m.exec(readFileSync(path.join(ROOT, 'src', 'generated', 'word-ids.ts'), 'utf8'))[1])
const levelOfId = (id) => {
  const n = /^w[0-9a-z]{3,}$/.test(id) ? parseInt(id.slice(1), 36) : -1
  return ID_RUNS.find(([first, count]) => n >= first && n < first + count)?.[2]
}
const levels = {}
for (const l of [5, 4, 3, 2, 1]) {
  const rows = JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', `words-n${l}.json`), 'utf8'))
  levels[l] = rows.map(([id, w, r, ko, en, o, f, k = ''], idx) => {
    if (levelOfId(id) !== l) throw new Error(`N${l} row ${idx}: "${id}" is not an N${l} word in src/generated/word-ids.ts; rebuild the data (npm run data)`)
    return { id, level: l, idx, w, r, ko, o: typeof o === 'number' ? o : idx, k }
  })
}
const find = (level, written) => {
  const w = levels[level].find((x) => x.w === written)
  if (!w) throw new Error(`word ${written} not found in N${level}`)
  return w
}

// ── simulated learner ──────────────────────────────────────────────────────────────────────────────────────
const KST = '+09:00'
const DAY = 86_400_000
const at = (ymd, hm = '20:00') => Date.parse(`${ymd}T${hm}:00${KST}`)
const ymdOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10)
/** "Now" in every screenshot: Saturday 2026-11-14, 08:30 in Seoul, 22 days before the 2026-12-06 exam. */
const TODAY = '2026-11-14'
const NOW = at(TODAY, '08:30')

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ser = (c) => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.getTime(),
})

/**
 * An N3 learner who also studies N5·N4 (the app's default for new learners), 20 new words a day with the
 * cognate fast-track on, since 2026-07-06 (the day after the July exam), missing a few days. Returns the saved state as the app stores it.
 */
function simulate() {
  const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))
  const rand = rng(20261114)
  const order = [5, 4, 3].flatMap((l) => [...levels[l]].sort((a, b) => a.o - b.o || a.idx - b.idx))
  let next = 0
  const cards = new Map() // id -> ts-fsrs Card
  const log = {}
  let xp = 0
  const start = Date.parse(`2026-07-06T00:00:00${KST}`)
  const skip = new Set(['2026-07-19', '2026-08-15', '2026-09-05', '2026-09-27', '2026-10-03', '2026-10-04', '2026-10-19', '2026-11-01'])

  const answer = (id, card, t, rating, day) => {
    const res = f.next(card, new Date(Math.max(t, card.last_review?.getTime() ?? 0)), rating)
    cards.set(id, res.card)
    day.c++
  }

  for (let d = start; ymdOf(d) < TODAY; d += DAY) {
    const ymd = ymdOf(d)
    if (skip.has(ymd)) continue
    const day = { c: 0, n: 0, r: 0, p: 0, e: 0 }
    let t = at(ymd, rand() < 0.7 ? '21:10' : '07:40')
    const end = at(ymd, '23:59')
    // reviews due before midnight, oldest due first
    const due = [...cards].filter(([, c]) => c.state === CardState.Review && c.due.getTime() <= end).sort((a, b) => a[1].due - b[1].due)
    for (const [id, c] of due) {
      const r = f.get_retrievability(c, new Date(t), false)
      const ok = rand() < r
      day.r++
      day.p += ok ? 1 : 0
      day.e += r
      answer(id, c, t, ok ? (rand() < 0.12 ? Rating.Easy : Rating.Good) : Rating.Again, day)
      t += 6_000 + Math.floor(rand() * 5_000)
    }
    // 20 new words, in the app's order (frequency within a level, N5 → N4 → N3)
    for (let k = 0; k < 20 && next < order.length; k++) {
      const w = order[next++]
      const id = w.k === 'S' ? w.id + READING : w.id
      const x = rand()
      answer(id, createEmptyCard(new Date(t)), t, x < 0.18 ? Rating.Again : x < 0.88 ? Rating.Good : Rating.Easy, day)
      day.n++
      t += 8_000 + Math.floor(rand() * 6_000)
    }
    // learning steps come back within the session
    for (let pass = 0; pass < 6; pass++) {
      const learning = [...cards].filter(([, c]) => c.state !== CardState.Review && c.state !== CardState.New && c.due.getTime() <= t + 20 * 60_000)
      if (!learning.length) break
      for (const [id, c] of learning) {
        t = Math.max(t, c.due.getTime())
        answer(id, c, t, rand() < 0.85 ? Rating.Good : Rating.Again, day)
        t += 7_000
      }
    }
    // learning cards still pending at the end of the session are finished the next morning, like the app's
    // queue would bring them back; graduate them at their due time so no card is left mid-step
    for (const [id, c] of cards)
      if (c.state === CardState.Learning || c.state === CardState.Relearning) {
        const res = f.next(c, new Date(Math.max(c.due.getTime(), end)), Rating.Good)
        cards.set(id, res.card)
        day.c++
      }
    day.xp = day.c * 10
    day.ms = day.c * 7_500
    day.q = 1
    xp += day.xp + 50
    log[ymd] = day
  }

  const marks = [find(5, '大丈夫').id, find(4, '留守').id, find(5, '勉強').id]
  return {
    v: 4,
    onboarded: true,
    settings: {
      target: 3,
      examDate: '2026-12-06',
      dailyNew: 20,
      theme: 'light',
      autoSpeak: false,
      includeLower: true,
      goal: 0.8,
      fastTrack: true,
    },
    cards: Object.fromEntries([...cards].map(([id, c]) => [id, ser(c)])),
    log,
    marks,
    xp,
  }
}

const base = simulate()
const clone = (s) => JSON.parse(JSON.stringify(s))

/**
 * Today's queue reduced to one chosen review card: today's new words are already done, every other card due
 * today moves to tomorrow, and `id` becomes a mature review card due this morning.
 */
function onlyCard(id, theme = 'light') {
  const s = clone(base)
  s.settings.theme = theme
  const tomorrow = at('2026-11-15', '09:00')
  for (const c of Object.values(s.cards)) if (c.due <= at(TODAY, '23:59')) c.due = tomorrow
  s.log[TODAY] = { c: 31, n: 20, r: 11, p: 10, e: 9.6, xp: 310, ms: 232_000 }
  s.cards[id] = {
    due: at(TODAY, '07:00'),
    stability: 14.2,
    difficulty: 5.4,
    elapsed_days: 15,
    scheduled_days: 15,
    learning_steps: 0,
    reps: 4,
    lapses: 0,
    state: 2,
    last_review: at('2026-10-30', '21:10'),
  }
  return s
}

// ── server ─────────────────────────────────────────────────────────────────────────────────────────────────
const freePort = () =>
  new Promise((res, rej) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
  })

async function serve() {
  if (!SKIP_BUILD) {
    console.log(`build: ${ROOT}`)
    const b = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    if (b.status !== 0) throw new Error('npm run build failed')
  }
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('no dist/index.html: build first')
  const port = Number(arg('port', 0)) || (await freePort())
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    // own process group: npx starts vite as a child, and both must go when we stop
    detached: true,
  })
  const stop = () => {
    try {
      process.kill(-proc.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  const url = `http://127.0.0.1:${port}/`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  stop()
  throw new Error(`vite preview did not answer on ${url}`)
}

// ── screens ────────────────────────────────────────────────────────────────────────────────────────────────
/** Where the app keeps its state since stable word ids (src/store.ts STATE_KEY); the seed is a v4 state. */
const KEY = 'kasane.state.v4'
const META_KEY = 'kasane.meta'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Each shot: the seeded state, the route, and what to do before the capture. */
const daijoubu = find(5, '大丈夫').id
const sangyou = find(4, '産業').id + READING
const SHOTS = [
  {
    name: '01-home',
    state: () => base,
    hash: '/',
    ready: (p) => p.getByRole('heading', { name: /시험날 기억할 단어/ }).waitFor(),
  },
  {
    name: '02-reading-card',
    state: () => onlyCard(sangyou),
    hash: '/study',
    ready: async (p) => {
      await p.locator('.reading-card').waitFor()
      await wait(500)
      const right = await p.locator('.choice').filter({ hasText: /^さんぎょう$/ })
      await right.click()
      await p.locator('.flash-answer').waitFor()
    },
  },
  {
    name: '03-false-friend',
    state: () => onlyCard(daijoubu),
    hash: '/study',
    ready: async (p) => {
      await p.locator('.flash').waitFor()
      await wait(500)
      await p.locator('.flash').click()
      await p.locator('.flash-meaning').waitFor()
    },
  },
  {
    name: '04-stats',
    state: () => base,
    hash: '/stats',
    ready: async (p) => {
      // past the stamp grid to the summary, the 7-day review forecast and the study calendar
      await p.locator('.stat-grid').waitFor()
      await p.evaluate(() => {
        const el = document.querySelector('.stat-grid')
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24)
      })
    },
  },
  {
    name: '05-words-sheet',
    state: () => base,
    hash: '/words',
    ready: async (p) => {
      await p.getByPlaceholder('일본어, 읽기, 뜻으로 검색').fill('迷惑')
      await p.locator('.word-row').filter({ hasText: '迷惑' }).first().click()
      await p.getByRole('dialog').waitFor()
    },
  },
  {
    name: '06-done',
    state: () => onlyCard(find(4, '約束').id + READING),
    hash: '/study',
    ready: async (p) => {
      await p.locator('.reading-card').waitFor()
      await wait(500)
      await p.locator('.choice').filter({ hasText: /^やくそく$/ }).click()
      await wait(500)
      await p.getByRole('button', { name: /^다음/ }).click()
      await p.locator('.done-mascot').waitFor()
    },
  },
  {
    name: '07-home-dark',
    state: () => ({ ...clone(base), settings: { ...base.settings, theme: 'dark' } }),
    hash: '/',
    ready: (p) => p.getByRole('heading', { name: /시험날 기억할 단어/ }).waitFor(),
  },
  {
    name: '08-level',
    state: () => base,
    hash: '/level/3',
    ready: (p) => p.getByRole('heading', { name: 'JLPT N3' }).waitFor(),
  },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await serve()
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  try {
    for (const size of SIZES)
      for (const shot of SHOTS) {
        if (ONLY.length && !ONLY.includes(shot.name)) continue
        const ctx = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: size.scale,
          isMobile: true,
          hasTouch: true,
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
          serviceWorkers: 'block',
          colorScheme: shot.name.includes('dark') ? 'dark' : 'light',
          reducedMotion: 'reduce',
        })
        const page = await ctx.newPage()
        await page.clock.install({ time: NOW })
        await page.addInitScript(
          ([k, v, mk, mv]) => {
            localStorage.setItem(k, v)
            localStorage.setItem(mk, mv)
          },
          // a backup made a few days ago, so the "back up your records" nudge does not cover the screen
          [KEY, JSON.stringify(shot.state()), META_KEY, JSON.stringify({ lastExport: '2026-11-10' })],
        )
        await page.goto(`${server.url}#${shot.hash}`)
        await shot.ready(page)
        await page.evaluate(() => document.fonts.ready)
        await wait(800) // let the daruma fill and the numbers settle
        const file = path.join(OUT, `${shot.name}_${size.name}.png`)
        await page.screenshot({ path: file, fullPage: false })
        console.log(`saved ${file}`)
        await ctx.close()
      }
  } finally {
    await browser.close()
    server.stop()
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
