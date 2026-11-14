import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Button, ChipGroup, Empty, IconButton } from '../components/ui'
import { WordSheet } from '../components/WordSheet'
import { inGroup, TypeFilter, TYPE_GROUPS, type TypeGroup } from '../components/TypeFilter'
import { COUNTS, meaning, useLevel, type Level, type Word } from '../data'
import { breakdowns, STAGE_LABEL, wordStage, type Stage } from '../srs'
import { update, useStore } from '../store'
import { StageBar } from '../components/LevelList'

const PAGE = 100

/** A word's memory stage as plain text at the row's right, its stage colour only as a small dot (never colour alone). */
function StageTag({ stage }: { stage: Stage }) {
  return <span className={`word-aside stage-dot ${stage}`}>{STAGE_LABEL[stage]}</span>
}
const FILTERS: ('all' | Stage)[] = ['all', 'learning', 'young', 'mature', 'new']

export function LevelScreen({ level }: { level: Level }) {
  const s = useStore((x) => x)
  const { words, error } = useLevel(level)
  const [filter, setFilter] = useState<'all' | Stage>('all')
  const [type, setType] = useState<TypeGroup>('all')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<Word | null>(null)
  const b = breakdowns(s)[level]
  const isTarget = s.settings.target === level

  const list = useMemo(
    () => (words ?? []).filter((w) => (filter === 'all' || wordStage(s, w.id) === filter) && inGroup(w.k, type)),
    [words, filter, type, s],
  )
  const typeCounts = useMemo(() => {
    const c = Object.fromEntries(TYPE_GROUPS.map(([g]) => [g, 0])) as Record<TypeGroup, number>
    for (const w of words ?? []) for (const [g] of TYPE_GROUPS) if (g !== 'all' && inGroup(w.k, g)) c[g]++
    return c
  }, [words])

  return (
    <>
      <header className="top">
        <IconButton label="뒤로" href="#/words" icon={<Icon name="back" />} />
        <div className="grow">
          <h1>JLPT N{level}</h1>
          <p className="subtitle">단어 {COUNTS[level].toLocaleString()}개</p>
        </div>
        {isTarget ? (
          <span className="level-target">목표 급수</span>
        ) : (
          <Button label="목표로 설정" size="sm" onClick={() => update((d) => void (d.settings.target = level))} />
        )}
      </header>

      {/* the level's memory on the ground: one line, the stage bar, four figures in the body ink */}
      <section className="level-summary" aria-label={`N${level} 기억 상태`}>
        {words && (
          <p className="fast-count">
            {s.settings.fastTrack ? (
              <>
                뜻 같은 한자어 <b>{typeCounts.S.toLocaleString()}개</b>는 읽기만 물어요
              </>
            ) : (
              <>모든 단어를 뜻 카드로 배워요</>
            )}
          </p>
        )}
        <StageBar b={b} total={COUNTS[level]} />
        <div className="breakdown">
          {(['mature', 'young', 'learning', 'new'] as Stage[]).map((k) => (
            <div key={k} className={k}>
              <b className="num">{b[k].toLocaleString()}</b>
              <span className="stage-dot">{STAGE_LABEL[k]}</span>
            </div>
          ))}
        </div>
      </section>

      <ChipGroup
        scroll
        label="기억 단계"
        value={filter}
        options={FILTERS.map((f) => [f, f === 'all' ? '전체' : STAGE_LABEL[f]])}
        onChange={(f) => {
          setFilter(f)
          setShown(PAGE)
        }}
      />

      <TypeFilter
        value={type}
        counts={typeCounts}
        onChange={(g) => {
          setType(g)
          setShown(PAGE)
        }}
      />

      {error && <p className="error">{error}</p>}
      <div className="word-list">
        {list.slice(0, shown).map((w) => (
          <button key={w.id} className="word-row" onClick={() => setOpen(w)}>
            <span className="word-main">
              <b lang="ja">{w.w}</b>
              {w.r && <span lang="ja">{w.r}</span>}
            </span>
            <span className="word-meaning">{meaning(w)}</span>
            <StageTag stage={wordStage(s, w.id)} />
          </button>
        ))}
      </div>
      {words && list.length === 0 && <Empty title="해당하는 단어가 없어요" />}
      {list.length > shown && <Button label={`더 보기 · ${(list.length - shown).toLocaleString()}개 남음`} width="100%" onClick={() => setShown(shown + PAGE)} />}
      <WordSheet word={open} onClose={() => setOpen(null)} />
    </>
  )
}
