import { useEffect, useState } from 'react'
import { platform } from './platform'

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function daysBetween(a: Date, b: Date): number {
  const u = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((u(b) - u(a)) / 86400000)
}

function firstSunday(year: number, month: number): Date {
  const d = new Date(year, month, 1)
  d.setDate(1 + ((7 - d.getDay()) % 7))
  return d
}

/** JLPT is held on the first Sunday of July and December. */
export function upcomingExams(from = new Date(), count = 3): string[] {
  const out: string[] = []
  for (let y = from.getFullYear(); out.length < count; y++)
    for (const m of [6, 11]) {
      const d = firstSunday(y, m)
      if (daysBetween(from, d) >= 0 && out.length < count) out.push(dayKey(d))
    }
  return out
}

export function formatDay(key: string): string {
  const d = parseDay(key)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Read Japanese aloud: the browser's speech on the web, the iOS voice in the app (src/platform). */
export function speak(text: string) {
  platform.speak(text)
}

/**
 * Re-render once a minute and whenever the app returns to the foreground, so screens that show "today"
 * roll over at midnight and pick up cards that came due while the app stayed open. Returns a value that
 * changes on every tick, for use as a memo dependency.
 */
export function useClock(active = true): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!active) return
    const bump = () => setT(Date.now())
    const id = setInterval(bump, 60_000)
    document.addEventListener('visibilitychange', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [active])
  return t
}
