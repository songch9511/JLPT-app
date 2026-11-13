import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { LevelList } from '../components/LevelList'
import { inGroup, TypeFilter, type TypeGroup } from '../components/TypeFilter'
import { WordSheet } from '../components/WordSheet'
import { meaning, useAllWords, type Word } from '../data'
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
      <span className="chip">{extra ?? `N${w.level}`}</span>
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
  const levels = useMemo(() => breakdowns({ cards, settings: { fastTrack } }), [cards, fastTrack])

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

  const weak = useMemo(() => leechIds(cards, 40, fastTrack), [cards, fastTrack])
  const weakWords = pick(weak).filter((w) => inGroup(w.k, type))
  const markWords = pick(marks).filter((w) => inGroup(w.k, type))

  return (
    <>
      <header className="top">
        <h1>단어장</h1>
      </header>
      <div className="seg">
        {(
          [
            ['search', '검색'],
            ['marks', `북마크 ${marks.length || ''}`],
            ['weak', `약한 단어 ${weak.length || ''}`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <TypeFilter value={type} onChange={setType} />

      {tab === 'search' && (
        <>
          <label className="search">
            <Icon name="search" size={20} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="일본어, 읽기, 뜻으로 검색"
              aria-label="단어 검색"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <div className="word-list">
            {results.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} />
            ))}
          </div>
          {!q.trim() && type === 'all' && <p className="empty">N5부터 N1까지 8,130개 단어에서 찾아요.</p>}
          {(q.trim() || type !== 'all') && all && results.length === 0 && <p className="empty">찾는 단어가 없어요.</p>}
        </>
      )}

      {tab === 'marks' && (
        <>
          <div className="word-list">
            {markWords.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} />
            ))}
          </div>
          {marks.length === 0 && <p className="empty">카드의 북마크 버튼으로 따로 모아 둘 단어를 담아 보세요.</p>}
        </>
      )}

      {tab === 'weak' && (
        <>
          <div className="word-list">
            {weakWords.map((w) => (
              <Row key={w.id} w={w} onOpen={setOpen} extra={`${wordLapses({ cards, settings: { fastTrack } }, w.id)}번 잊음`} />
            ))}
          </div>
          {weak.length === 0 && <p className="empty">복습에서 두 번 이상 잊어버린 단어가 여기에 모여요.</p>}
        </>
      )}

      <LevelList all={levels} target={target} />

      {open && <WordSheet word={open} onClose={() => setOpen(null)} />}
    </>
  )
}
