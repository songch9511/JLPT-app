import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { WordSheet } from '../components/WordSheet'
import { COUNTS, meaning, useLevel, type Level, type Word } from '../data'
import { breakdowns, STAGE_LABEL, stageOf, type Stage } from '../srs'
import { update, useStore } from '../store'
import { StageBar } from './Home'

const PAGE = 100
const FILTERS: ('all' | Stage)[] = ['all', 'learning', 'young', 'mature', 'new']

export function LevelScreen({ level }: { level: Level }) {
  const s = useStore((x) => x)
  const { words, error } = useLevel(level)
  const [filter, setFilter] = useState<'all' | Stage>('all')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<Word | null>(null)
  const b = breakdowns(s)[level]
  const isTarget = s.settings.target === level

  const list = useMemo(
    () => (words ?? []).filter((w) => filter === 'all' || stageOf(s.cards[w.id]) === filter),
    [words, filter, s.cards],
  )

  return (
    <>
      <header className="top">
        <a className="icon-btn" href="#/" aria-label="뒤로">
          <Icon name="back" />
        </a>
        <div className="grow">
          <h1>JLPT N{level}</h1>
          <p className="muted">단어 {COUNTS[level].toLocaleString()}개</p>
        </div>
        {isTarget ? (
          <span className="chip accent">목표 급수</span>
        ) : (
          <button className="btn ghost" onClick={() => update((d) => void (d.settings.target = level))}>
            목표로 설정
          </button>
        )}
      </header>

      <section className="card">
        <StageBar b={b} total={COUNTS[level]} />
        <div className="breakdown">
          {(['mature', 'young', 'learning', 'new'] as Stage[]).map((k) => (
            <div key={k} className={k}>
              <b>{b[k]}</b>
              <span>{STAGE_LABEL[k]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="seg scroll">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? 'on' : ''}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f)
              setShown(PAGE)
            }}
          >
            {f === 'all' ? '전체' : STAGE_LABEL[f]}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="word-list">
        {list.slice(0, shown).map((w) => (
          <button key={w.id} className="word-row" onClick={() => setOpen(w)}>
            <span className="word-main">
              <b lang="ja">{w.w}</b>
              {w.r && <span lang="ja">{w.r}</span>}
            </span>
            <span className="word-meaning">{meaning(w)}</span>
            <span className={`dot ${stageOf(s.cards[w.id])}`} />
          </button>
        ))}
      </div>
      {words && list.length === 0 && <p className="empty">여기에 해당하는 단어가 아직 없어요.</p>}
      {list.length > shown && (
        <button className="btn ghost" onClick={() => setShown(shown + PAGE)}>
          더 보기 ({list.length - shown}개 남음)
        </button>
      )}
      {open && <WordSheet word={open} onClose={() => setOpen(null)} />}
    </>
  )
}
