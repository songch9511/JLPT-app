import { useMemo, useState } from 'react'
import { LevelList } from '../components/LevelList'
import { Choice, Empty, SearchField } from '../components/ui'
import { inGroup, TypeFilter, type TypeGroup } from '../components/TypeFilter'
import { WordSheet } from '../components/WordSheet'
import { levelInfoVersion, meaning, useAllWords, type Word } from '../data'
import { breakdowns, leechIds, wordLapses } from '../srs'
import { useStore } from '../store'

type Tab = 'search' | 'marks' | 'weak'

function Row({ w, onOpen, extra }: { w: Word; onOpen: (w: Word) => void; extra?: string }) {
  return (
    <button className="word-row" onClick={() => onOpen(w)}>
      <span className="word-main">
        <b lang="ja">{w.w}</b>
        {w.r && <span lang="ja">{w.r}</span>}
      </span>
      <span className="word-meaning">{meaning(w)}</span>
      <span className="word-aside">{extra ?? `N${w.level}`}</span>
    </button>
  )
}

export function Words({ initialTab }: { initialTab?: Tab } = {}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'search')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Word | null>(null)
  const all = useAllWords()
  const marks = useStore((s) => s.marks)
  const cards = useStore((s) => s.cards)
  const target = useStore((s) => s.settings.target)
  const fastTrack = useStore((s) => s.settings.fastTrack)
  const [type, setType] = useState<TypeGroup>('all')
  // level data decides which reading cards still count (srs.ts isActive): recount once it has loaded
  const iv = levelInfoVersion()
  const levels = useMemo(() => breakdowns({ cards, settings: { fastTrack } }), [cards, fastTrack, iv])

  const byId = useMemo(() => new Map(all?.map((w) => [w.id, w])), [all])
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((w): w is Word => !!w)

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    // with a type chosen and nothing typed, the list is every word of that type (by level, then frequency)
    if (!all || (!t && type === 'all')) return []
    const out: Word[] = []
    const pool = t ? all : all.slice().sort((a, b) => b.level - a.level || a.o - b.o)
    for (const w of pool) {
      if (inGroup(w.k, type) && (!t || w.w.includes(t) || w.r.includes(t) || w.ko.includes(t) || w.en.toLowerCase().includes(t))) out.push(w)
      if (out.length >= (t ? 60 : 200)) break
    }
    return out
  }, [all, q, type])

  const weak = useMemo(() => leechIds(cards, 40, fastTrack), [cards, fastTrack, iv])
  const weakWords = pick(weak).filter((w) => inGroup(w.k, type))
  const markWords = pick(marks).filter((w) => inGroup(w.k, type))

  return (
    <>
      <header className="top">
        <h1>단어장</h1>
      </header>
      <Choice
        label="단어 목록"
        value={tab}
        options={[
          ['search', '검색'],
          ['marks', `북마크 ${marks.length || ''}`.trim()],
          ['weak', `약한 단어 ${weak.length || ''}`.trim()],
        ]}
        onChange={setTab}
      />
      <TypeFilter value={type} onChange={setType} />

      {tab === 'search' && (
        <>
          <SearchField label="단어 검색" value={q} onChange={setQ} placeholder="일본어, 읽기, 뜻으로 검색" />
          <div className="word-list">
            {results.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} />
            ))}
          </div>
          {(q.trim() || type !== 'all') && all && results.length === 0 && <Empty title="찾는 단어가 없어요" />}
        </>
      )}

      {tab === 'marks' && (
        <>
          <div className="word-list">
            {markWords.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} />
            ))}
          </div>
          {marks.length === 0 && <Empty title="북마크한 단어가 없어요" description="학습 카드나 단어 정보에서 북마크하면 여기 모여요." />}
        </>
      )}

      {tab === 'weak' && (
        <>
          <div className="word-list">
            {weakWords.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} extra={`${wordLapses({ cards, settings: { fastTrack } }, w.id)}번 잊음`} />
            ))}
          </div>
          {weak.length === 0 && <Empty title="약한 단어가 없어요" description="복습에서 두 번 이상 잊은 단어가 여기 모여요." />}
        </>
      )}

      <LevelList all={levels} target={target} />

      <WordSheet word={open} onClose={() => setOpen(null)} />
    </>
  )
}
