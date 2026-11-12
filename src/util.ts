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

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text.replace(/[～~]/g, ''))
  u.lang = 'ja-JP'
  u.rate = 0.9
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'))
  if (voice) u.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}
