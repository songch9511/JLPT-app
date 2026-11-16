// A level in the 단어장 (docs/design-system.md §3 "급수 화면"): its chapters (50 words each, in frequency order), one
// chapter's words, and the level's kanji as a grid.
import { useEffect, useMemo, useRef, useState } from 'react'
import { go } from '../App'
import { Button, IconButton } from '../components/ui'
import { Icon } from '../components/Icon'
import { DetailSheet, type Detail } from '../components/WordSheet'
import { LevelBadge } from '../components/LevelBadge'
import { WordRow } from './Words'
import { Seal } from './Done'
import { chapterCount, chapterIds, COUNTS, useLevel, wordById, type Level, type Word } from '../data'
import { kanjiIdsOfLevel, kanjiInfo, KANJI_COUNTS, useKanji, type Kanji } from '../kanji'
import { breakdowns, kanjiBreakdowns, stageOf, type Stage } from '../srs'
import { chapterMet, chapterSize, chaptersDone, currentChapter } from '../progress'
import { useStore, type State } from '../store'

const f = (n: number) => n.toLocaleString('ko-KR')
/** The three stages the lists show: long-term memory, learning (learning and young), not yet. */
type Shown = 'mature' | 'learning' | 'new'
const shown = (st: Stage): Shown => (st === 'mature' ? 'mature' : st === 'new' ? 'new' : 'learning')
const SHOWN_LABEL: Record<Shown, string> = { mature: '장기 기억', learning: '익히는 중', new: '아직' }

function LevelHead({ level, back, children }: { level: Level; back: string; children?: React.ReactNode }) {
  return (
    <header className="top sub-head">
      <IconButton label="뒤로" href={`#${back}`} icon={<Icon name="back" />} />
      {children ?? (
        <h1 className="level-title">
          <LevelBadge level={level} className="xl" />
        </h1>
      )}
    </header>
  )
}

/** "장기 기억 8 · 익히는 중 16 · 아직 26" as a stacked bar and a legend in ink. */
function StageSummary({ label, met, total, counts }: { label: string; met: number; total: number; counts: Record<Shown, number> }) {
  return (
    <section className="summary-card" aria-label={`${label} ${f(total)}개 중 ${f(met)}개`}>
      <p className="summary-line">
        <span>{label}</span>
        <span>
          <b className="num">{f(met)}</b> / {f(total)}
        </span>
      </p>
      <div className="bar stagebar" role="img" aria-label={(['mature', 'learning', 'new'] as Shown[]).map((k) => `${SHOWN_LABEL[k]} ${counts[k]}`).join(', ')}>
        <i className="mature" style={{ width: `${(counts.mature / Math.max(1, total)) * 100}%` }} />
        <i className="learning" style={{ width: `${(counts.learning / Math.max(1, total)) * 100}%` }} />
      </div>
      <p className="legend" aria-hidden="true">
        {(['mature', 'learning', 'new'] as Shown[]).map((k) => (
          <span key={k} className={k}>
            {SHOWN_LABEL[k]} {f(counts[k])}
          </span>
        ))}
      </p>
    </section>
  )
}

const countsOf = (s: Pick<State, 'cards'>, ids: string[]) => {
  const c: Record<Shown, number> = { mature: 0, learning: 0, new: 0 }
  for (const id of ids) c[shown(stageOf(s.cards[id]))]++
  return c
}

/** 5-2: a level's chapters. */
export function LevelScreen({ level }: { level: Level }) {
  const s = useStore((x) => x)
  useLevel(level)
  const met = COUNTS[level] - breakdowns(s)[level].new
  const done = chaptersDone(s, level)
  const now = currentChapter(s, level)
  const n = chapterCount(level)
  // the list opens at the current chapter, a few done ones above it
  const nowRow = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (now > 4) nowRow.current?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <>
      <LevelHead level={level} back="/words" />
      <section className="summary-card" aria-label={`N${level} 단어 ${f(COUNTS[level])}개 중 ${f(met)}개 만남, ${n}챕터 중 ${done}챕터 끝`}>
        <p className="summary-line" aria-hidden="true">
          <span>
            {n}챕터 중 {done} 끝
          </span>
          <span>
            <b className="num">{f(met)}</b> / {f(COUNTS[level])}
          </span>
        </p>
        <span className="bar ink" aria-hidden="true">
          <i style={{ width: `${(met / COUNTS[level]) * 100}%` }} />
        </span>
      </section>
      <nav className="link-card chapters" aria-label="챕터">
        {Array.from({ length: n }, (_, i) => i + 1).map((c) => {
          const m = chapterMet(s, level, c)
          const size = chapterSize(level, c)
          const complete = m === size
          const current = c === now && !complete
          return (
            <a key={c} ref={c === now ? nowRow : undefined} href={`#/level/${level}/${c}`} className={`chapter-row ${complete ? 'done' : current ? 'now' : m === 0 ? 'later' : ''}`} aria-label={`챕터 ${c}${current ? ', 지금' : ''}, ${size}단어 중 ${m} 만남${complete ? ', 끝' : ''}`}>
              <span className="grow chapter-text" aria-hidden="true">
                <span className="chapter-title">
                  챕터 {c}
                  {current && <span className="now-tag">지금</span>}
                </span>
                <span className="chapter-sub">{complete || m === 0 ? `${size}단어` : `${m} / ${size}`}</span>
              </span>
              {complete ? (
                <Seal className="sm" />
              ) : m > 0 ? (
                <span className="bar ink small" aria-hidden="true">
                  <i style={{ width: `${(m / size) * 100}%` }} />
                </span>
              ) : (
                <span className="seal-empty" aria-hidden="true" />
              )}
              <Icon name="chevron" size={16} />
            </a>
          )
        })}
      </nav>
    </>
  )
}

/** 5-3: one chapter's words, and a way to look at the ones met again. */
export function Chapter({ level, n }: { level: Level; n: number }) {
  const s = useStore((x) => x)
  const { words } = useLevel(level)
  const [open, setOpen] = useState<Detail | null>(null)
  const ids = chapterIds(level, n)
  const counts = countsOf(s, ids)
  const met = ids.length - counts.new
  const list = words ? ids.map((id) => wordById(id)).filter((w): w is Word => !!w) : []
  return (
    <div className="page-fill">
      <LevelHead level={level} back={`/level/${level}`}>
        <h1 className="level-title">
          <LevelBadge level={level} className="title" />
          챕터 {n}
        </h1>
      </LevelHead>
      <StageSummary label="만난 단어" met={met} total={ids.length} counts={counts} />
      {list.length > 0 && (
        <div className="word-list">
          {list.map((w) => {
            const st = shown(stageOf(s.cards[w.id]))
            return <WordRow key={w.id} w={w} onOpen={(word) => setOpen({ word })} aside={<span className={`stage-dot ${st}`}>{SHOWN_LABEL[st]}</span>} />
          })}
        </div>
      )}
      {met > 0 && (
        <div className="page-actions">
          <Button label={`챕터 ${n} 만난 단어 ${met}개 다시 보기`} size="lg" width="100%" onClick={() => go(`/practice/chapter/${level}/${n}`)}>
            이 챕터 다시 보기
          </Button>
        </div>
      )}
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** 5-6: a level's kanji as a grid, each with its 음 and a dot for its stage. */
export function KanjiLevel({ level }: { level: Level }) {
  const s = useStore((x) => x)
  const all = useKanji()
  const [open, setOpen] = useState<Detail | null>(null)
  const ids = kanjiIdsOfLevel(level)
  const b = useMemo(() => kanjiBreakdowns(s)[level], [s.cards, level])
  const counts: Record<Shown, number> = { mature: b.mature, learning: b.learning + b.young, new: b.new }
  return (
    <>
      <LevelHead level={level} back="/words/kanji">
        <h1 className="level-title">
          <LevelBadge level={level} className="xl" />
          <span className="level-title-kind">한자</span>
        </h1>
      </LevelHead>
      <StageSummary label="만난 한자" met={KANJI_COUNTS[level] - b.new} total={KANJI_COUNTS[level]} counts={counts} />
      <div className="kanji-grid" role="group" aria-label={`N${level} 한자`}>
        {all &&
          ids.map((id) => {
            const k = kanjiInfo(id) as Kanji | null
            if (!k) return null
            const st = shown(stageOf(s.cards[id]))
            return (
              <button key={id} type="button" className="kanji-tile" aria-label={`${k.k} ${k.eum}, ${SHOWN_LABEL[st]}`} onClick={() => setOpen({ kanji: k })}>
                <i className={`tile-dot ${st}`} aria-hidden="true" />
                <span lang="ja" className="kt-char">
                  {k.k}
                </span>
                <span className="kt-eum">{k.eum}</span>
              </button>
            )
          })}
      </div>
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </>
  )
}
