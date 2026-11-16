// The first run's first question (docs/design-system.md §3 "급수 고르기"): the five levels as stacked cards in a row,
// easiest first, each with its word and kanji counts, the level's colour in waves and Ruma. Swipe (or the dots, or a tap
// on a card at the side) to bring a level to the middle; the button under the row starts it. The level is changed
// later only in 설정.
import { useEffect, useRef, useState } from 'react'
import { Ruma } from '../components/Ruma'
import { Button } from '../components/ui'
import { COUNTS, LEVELS, type Level } from '../data'
import { chooseLevel } from '../guide'
import { KANJI_COUNTS } from '../kanji'
import { useStore } from '../store'
import { UNOFFICIAL_LINE } from '../brand'

const f = (n: number) => n.toLocaleString('ko-KR')

/** One level's card: the counts, the level's name, two waves in its colours and Ruma at the corner. */
export function LevelCard({ level }: { level: Level }) {
  return (
    <span className="lv-card" data-level={level}>
      <span className="lv-card-back b2" aria-hidden="true" />
      <span className="lv-card-back b1" aria-hidden="true" />
      <span className="lv-card-face">
        <svg className="lv-waves" aria-hidden="true" viewBox="0 0 280 230" preserveAspectRatio="none">
          <path className="w1" d="M0 70 C40 30 90 20 140 48 C190 76 230 70 280 34 L280 230 L0 230 Z" />
          <path className="w2" d="M0 120 C50 86 100 96 150 118 C200 140 240 128 280 96 L280 230 L0 230 Z" />
        </svg>
        <span className="lv-card-text">
          <span className="lv-counts">
            {f(COUNTS[level])}단어 · {f(KANJI_COUNTS[level])}한자
          </span>
          <span className="lv-name">N{level}</span>
        </span>
        <span className="lv-ruma">
          <Ruma progress={1} mood="idle" size={98} />
        </span>
      </span>
    </span>
  )
}

export function LevelCarousel() {
  const target = useStore((s) => s.settings.target)
  const [at, setAt] = useState(Math.max(0, LEVELS.indexOf(target)))
  const row = useRef<HTMLDivElement>(null)
  /** the card a dot or a tap is bringing to the middle: the cards passed on the way are not chosen */
  const aim = useRef<number | null>(null)
  const level = LEVELS[at]

  /** Bring card `i` to the middle. */
  const show = (i: number, smooth = true) => {
    const el = row.current?.children[i] as HTMLElement | undefined
    if (!el || !row.current) return
    const left = el.offsetLeft - (row.current.clientWidth - el.offsetWidth) / 2
    aim.current = Math.abs(row.current.scrollLeft - left) > 1 ? i : null
    row.current.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' })
    setAt(i)
  }
  useEffect(() => show(at, false), [])
  const onScroll = () => {
    const r = row.current
    if (!r) return
    const mid = r.scrollLeft + r.clientWidth / 2
    let best = 0
    let dist = Infinity
    Array.from(r.children).forEach((c, i) => {
      const el = c as HTMLElement
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    if (aim.current !== null) {
      if (best === aim.current) aim.current = null
      return
    }
    setAt(best)
  }

  return (
    <div className="first-run level-carousel">
      <header className="first-head">
        <h1>준비하는 급수</h1>
      </header>
      <div className="lv-stage">
        <div className="lv-row" ref={row} onScroll={onScroll} aria-roledescription="carousel" aria-label="급수">
          {LEVELS.map((l, i) => (
            <button
              key={l}
              type="button"
              className={`lv-slot ${i === at ? 'on' : ''}`}
              aria-label={`N${l}, ${f(COUNTS[l])}단어, ${f(KANJI_COUNTS[l])}한자`}
              aria-current={i === at ? 'true' : undefined}
              onClick={() => show(i)}
            >
              <LevelCard level={l} />
            </button>
          ))}
        </div>
        <div className="lv-dots" role="group" aria-label="급수">
          {LEVELS.map((l, i) => (
            <button key={l} type="button" className={i === at ? 'on' : ''} aria-label={`N${l}`} aria-pressed={i === at} onClick={() => show(i)} />
          ))}
        </div>
      </div>
      <div className="first-actions">
        <Button label={`N${level} 시작하기`} variant="primary" size="lg" width="100%" className="first-go" onClick={() => chooseLevel(level)} />
        <p className="first-note">{UNOFFICIAL_LINE}</p>
      </div>
    </div>
  )
}
