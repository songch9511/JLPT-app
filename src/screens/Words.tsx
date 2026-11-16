// 단어장 (docs/design-system.md §3 "단어장"): the 단어 and 한자 tabs (a search field that opens the search, the bookmarks
// and the weak ones, the five levels), the search, the bookmark list and the weak list.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { go } from '../App'
import { Button, Choice, Empty, IconButton } from '../components/ui'
import { Icon } from '../components/Icon'
import { DetailSheet, type Detail } from '../components/WordSheet'
import { LevelBadge } from '../components/LevelBadge'
import { COUNTS, LEVELS, meaning, useAllWords, type Word } from '../data'
import { isKanjiId, KANJI_COUNTS, kanjiInfo, kunText, useKanji, type Kanji } from '../kanji'
import { breakdowns, kanjiBreakdowns, leechIds, wordLapses } from '../srs'
import { useStore } from '../store'

export type Kind = 'word' | 'kanji'
const f = (n: number) => n.toLocaleString('ko-KR')

/** The 단어 / 한자 switch at the top of the 단어장 screens. */
function KindTabs({ value, counts, onChange }: { value: Kind; counts?: [number, number]; onChange: (k: Kind) => void }) {
  return (
    <Choice
      label="단어 · 한자"
      value={value}
      options={[
        ['word', counts ? `단어 ${counts[0]}` : '단어'],
        ['kanji', counts ? `한자 ${counts[1]}` : '한자'],
      ]}
      onChange={onChange}
    />
  )
}

/** A page of the 단어장 with a way back and a title. */
function SubHead({ title, back = '/words', children }: { title?: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <header className="top sub-head">
      <IconButton label="뒤로" href={`#${back}`} icon={<Icon name="back" />} />
      {title && <h1 className="grow">{title}</h1>}
      {children}
    </header>
  )
}

/** A word in a list: the headword over its reading, the meaning, one fact at the right. */
export function WordRow({ w, onOpen, aside, mark }: { w: Word; onOpen: (w: Word) => void; aside?: ReactNode; mark?: string }) {
  return (
    <button type="button" className="word-row" onClick={() => onOpen(w)}>
      <span className="word-main">
        <b lang="ja">{w.w}</b>
        <span lang="ja">{w.r || ' '}</span>
      </span>
      <span className="word-meaning">{mark ? <Highlight text={meaning(w)} mark={mark} /> : meaning(w)}</span>
      <span className="word-aside">{aside ?? <LevelBadge level={w.level} />}</span>
    </button>
  )
}

/** A kanji in a list: the kanji, its 훈음 over its readings, its level at the right. */
export function KanjiListRow({ k, onOpen, aside, mark }: { k: Kanji; onOpen: (k: Kanji) => void; aside?: ReactNode; mark?: string }) {
  const readings = [...k.on.slice(0, 2), ...k.kun.slice(0, 2).map(kunText)].join(' · ')
  return (
    <button type="button" className="kanji-list-row" onClick={() => onOpen(k)}>
      <span lang="ja" className="klr-char">
        {k.k}
      </span>
      <span className="klr-text grow">
        <span className="klr-hun">
          {k.hun && `${k.hun} `}
          {mark && k.eum === mark ? <b>{k.eum}</b> : k.eum}
        </span>
        <span lang="ja" className="klr-yomi">
          {readings}
        </span>
      </span>
      <span className="word-aside">{aside ?? <LevelBadge level={k.level} />}</span>
    </button>
  )
}

/** The search's text in bold where it appears. */
function Highlight({ text, mark }: { text: string; mark: string }) {
  const i = mark ? text.indexOf(mark) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <b>{mark}</b>
      {text.slice(i + mark.length)}
    </>
  )
}

/** One row of a link card: a name, a number, a chevron. */
function LinkRow({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <a href={href} className="link-row" aria-label={`${label} ${f(count)}`}>
      <span className="grow">{label}</span>
      <b className="num-plain">{f(count)}</b>
      <Icon name="chevron" size={18} />
    </a>
  )
}

/** 5-1, 5-5: the 단어장 tab. */
export function Words({ kind }: { kind: Kind }) {
  const s = useStore((x) => x)
  const kanji = kind === 'kanji'
  const marks = s.marks.filter((m) => isKanjiId(m) === kanji).length
  const weak = useMemo(() => leechIds(s.cards, 1000, kanji).length, [s.cards, kanji])
  const b = useMemo(() => (kanji ? kanjiBreakdowns(s) : breakdowns(s)), [s.cards, kanji])
  const totals = kanji ? KANJI_COUNTS : COUNTS
  return (
    <>
      <header className="top">
        <h1>단어장</h1>
      </header>
      <KindTabs value={kind} onChange={(k) => go(k === 'kanji' ? '/words/kanji' : '/words')} />
      <a href={kanji ? '#/search/kanji' : '#/search/word'} className="search-field search-link" aria-label={kanji ? '한자 검색' : '단어 검색'}>
        <Icon name="search" size={20} />
        <span>{kanji ? '한자 · 음 · 읽기' : '단어 · 읽기 · 뜻'}</span>
      </a>
      <div className="link-card">
        <LinkRow href={kanji ? '#/marks/kanji' : '#/marks'} label="북마크" count={marks} />
        <LinkRow href={kanji ? '#/weak/kanji' : '#/weak'} label={kanji ? '약한 한자' : '약한 단어'} count={weak} />
      </div>
      <h2 className="group-title">급수</h2>
      <div className="link-card levels-card">
        {LEVELS.map((l) => {
          const met = totals[l] - b[l].new
          return (
            <a key={l} href={kanji ? `#/kanji/${l}` : `#/level/${l}`} className="level-row" aria-label={`N${l} ${kanji ? '한자' : '단어'}, ${f(totals[l])}개 중 ${f(met)}개 만남`}>
              <LevelBadge level={l} />
              <span className="bar ink" aria-hidden="true">
                <i style={{ width: `${(met / totals[l]) * 100}%` }} />
              </span>
              <span className="level-count">
                {f(met)} / {f(totals[l])}
              </span>
              <Icon name="chevron" size={18} />
            </a>
          )
        })}
      </div>
    </>
  )
}

const hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/** 5-9, 5-10: the search, for words (the word, its reading, its meaning) or kanji (the kanji, its 음 and 훈, readings). */
export function Search({ kind }: { kind: Kind }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Detail | null>(null)
  const kanjiTab = kind === 'kanji'
  const words = useAllWords(!kanjiTab)
  const kanji = useKanji(kanjiTab)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [kind])
  const t = q.trim()

  const wordHits = useMemo(() => {
    if (!words || !t || kanjiTab) return []
    const low = t.toLowerCase()
    const out: Word[] = []
    for (const w of words) {
      if (w.w.includes(t) || w.r.includes(hira(t)) || w.ko.includes(t) || w.en.toLowerCase().includes(low)) out.push(w)
      if (out.length >= 100) break
    }
    return out
  }, [words, t, kanjiTab])

  const kanjiHits = useMemo(() => {
    if (!kanji || !t || !kanjiTab) return []
    const h = hira(t)
    const exact: Kanji[] = []
    const rest: Kanji[] = []
    for (const k of kanji.values()) {
      if (k.eum === t || k.k === t) exact.push(k)
      else if ((t.length > 1 && k.hun.includes(t)) || k.on.some((r) => hira(r) === h) || k.kun.some((r) => r.replace(/[.-]/g, '').startsWith(h))) rest.push(k)
    }
    return [...exact, ...rest].slice(0, 100)
  }, [kanji, t, kanjiTab])

  const n = kanjiTab ? kanjiHits.length : wordHits.length
  return (
    <>
      <h1 className="sr-only">{kanjiTab ? '한자 검색' : '단어 검색'}</h1>
      <header className="top search-head">
        <IconButton label="뒤로" href={kanjiTab ? '#/words/kanji' : '#/words'} icon={<Icon name="back" />} />
        <div className="search-field grow" role="search">
          <Icon name="search" size={20} />
          <input
            ref={input}
            type="search"
            aria-label={kanjiTab ? '한자 검색' : '단어 검색'}
            placeholder={kanjiTab ? '한자 · 음 · 읽기' : '단어 · 읽기 · 뜻'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
          />
          {q && (
            <button type="button" className="search-clear" aria-label="지우기" onClick={() => (setQ(''), input.current?.focus())}>
              <Icon name="error" size={18} />
            </button>
          )}
        </div>
      </header>
      <KindTabs value={kind} onChange={(k) => go(k === 'kanji' ? '/search/kanji' : '/search/word')} />
      {t && (words || kanji) && (
        <p className="list-caption" role="status">
          {f(n)}개
        </p>
      )}
      {n > 0 && (
        <div className="word-list">
          {kanjiTab ? kanjiHits.map((k) => <KanjiListRow key={k.k} k={k} mark={t} onOpen={(kanji) => setOpen({ kanji })} />) : wordHits.map((w) => <WordRow key={w.id} w={w} mark={t} onOpen={(word) => setOpen({ word })} />)}
        </div>
      )}
      {t && (words || kanji) && n === 0 && <Empty title={kanjiTab ? '찾는 한자가 없어요' : '찾는 단어가 없어요'} />}
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** The words of some ids that have loaded, in that order. */
function useWordsOf(ids: string[], enabled = true) {
  const all = useAllWords(enabled && ids.length > 0)
  return useMemo(() => {
    const by = new Map(all?.map((w) => [w.id, w]))
    return ids.map((id) => by.get(id)).filter((w): w is Word => !!w)
  }, [all, ids])
}

/** 5-7: the bookmarks, words and kanji. */
export function Marks({ kind }: { kind: Kind }) {
  const marks = useStore((s) => s.marks)
  const [open, setOpen] = useState<Detail | null>(null)
  const wordIds = useMemo(() => marks.filter((m) => !isKanjiId(m)), [marks])
  const kanjiIds = useMemo(() => marks.filter(isKanjiId), [marks])
  const words = useWordsOf(wordIds, kind === 'word')
  const kanji = useKanji(kind === 'kanji')
  const ks = kanji ? kanjiIds.map((id) => kanjiInfo(id)).filter((k): k is Kanji => !!k) : []
  return (
    <>
      <SubHead title="북마크" />
      <KindTabs value={kind} counts={[wordIds.length, kanjiIds.length]} onChange={(k) => go(k === 'kanji' ? '/marks/kanji' : '/marks')} />
      {kind === 'word' ? (
        <>
          {words.length > 0 && (
            <div className="word-list">
              {words.map((w) => (
                <WordRow key={w.id} w={w} onOpen={(word) => setOpen({ word })} />
              ))}
            </div>
          )}
          {wordIds.length === 0 && <Empty title="북마크한 단어가 없어요" />}
        </>
      ) : (
        <>
          {ks.length > 0 && (
            <div className="word-list">
              {ks.map((k) => (
                <KanjiListRow key={k.k} k={k} onOpen={(kanji) => setOpen({ kanji })} />
              ))}
            </div>
          )}
          {kanjiIds.length === 0 && <Empty title="북마크한 한자가 없어요" />}
        </>
      )}
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** 5-8: the words (or kanji) forgotten most, most first, and a way to look at them all again. */
export function Weak({ kind }: { kind: Kind }) {
  const cards = useStore((s) => s.cards)
  const kanjiTab = kind === 'kanji'
  const ids = useMemo(() => leechIds(cards, 100, kanjiTab), [cards, kanjiTab])
  const [open, setOpen] = useState<Detail | null>(null)
  const words = useWordsOf(ids, !kanjiTab)
  const kanji = useKanji(kanjiTab)
  const ks = kanji ? ids.map((id) => kanjiInfo(id)).filter((k): k is Kanji => !!k) : []
  const lapses = (id: string) => (
    <span className="lapses">
      잊음 <b className="num-plain">{wordLapses({ cards }, id)}번</b>
    </span>
  )
  return (
    <div className="page-fill">
      <SubHead title={kanjiTab ? '약한 한자' : '약한 단어'} back={kanjiTab ? '/words/kanji' : '/words'} />
      {ids.length > 0 && <p className="list-caption">자주 잊은 순서</p>}
      {ids.length > 0 && (
        <div className="word-list">
          {kanjiTab
            ? ks.map((k) => <KanjiListRow key={k.k} k={k} aside={lapses(k.id)} onOpen={(kanji) => setOpen({ kanji })} />)
            : words.map((w) => <WordRow key={w.id} w={w} aside={lapses(w.id)} onOpen={(word) => setOpen({ word })} />)}
        </div>
      )}
      {ids.length === 0 && <Empty title={kanjiTab ? '약한 한자가 없어요' : '약한 단어가 없어요'} description="두 번 이상 잊은 것이 여기 모여요." />}
      {ids.length > 0 && (
        <div className="page-actions">
          <Button label={kanjiTab ? '이 한자들 다시 보기' : '이 단어들 다시 보기'} variant="primary" size="lg" width="100%" onClick={() => go(kanjiTab ? '/practice/weak-kanji' : '/practice/weak')} />
        </div>
      )}
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </div>
  )
}

