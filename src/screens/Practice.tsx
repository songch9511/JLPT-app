// "다시 보기" (docs/design-system.md §3 "챕터", "약한 단어"): a chapter's met words, or the weak words or kanji, shown
// again one by one on the study card. Looking again is not a review: nothing is graded into the schedule or the day's
// log. 모르겠어요 opens the card first, then puts the card once more at the end; 알아요 and 쉬워요 go on.
import { useMemo, useState } from 'react'
import { go } from '../App'
import { Icon } from '../components/Icon'
import { Ruma } from '../components/Ruma'
import { Button, IconButton, ProgressBar, Skeleton } from '../components/ui'
import { CardHead, KanjiFace, MeaningFace, useKanjiOf } from '../components/StudyCard'
import { chapterIds, LEVELS, levelOf, useLevels, wordById, type Level } from '../data'
import { useExample } from '../examples'
import { isKanjiId } from '../kanji'
import { leechIds } from '../srs'
import { getState, toggleMark, useStore } from '../store'
import { GradeButton } from './Study'

export type PracticeSet = { kind: 'chapter'; level: Level; n: number } | { kind: 'weak' } | { kind: 'weak-kanji' }

/** The cards of a practice set, fixed when it opens. */
function idsOf(set: PracticeSet): string[] {
  const s = getState()
  if (set.kind === 'chapter') return chapterIds(set.level, set.n).filter((id) => s.cards[id])
  return leechIds(s.cards, 100, set.kind === 'weak-kanji')
}
const backOf = (set: PracticeSet) => (set.kind === 'chapter' ? `/level/${set.level}/${set.n}` : set.kind === 'weak' ? '/weak' : '/weak/kanji')

export function Practice({ set }: { set: PracticeSet }) {
  const marks = useStore((s) => s.marks)
  const [ids] = useState(() => idsOf(set))
  const [queue, setQueue] = useState(ids)
  const [at, setAt] = useState(0)
  const [again, setAgain] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState({ meaning: false, kana: false })
  const levels = useLevels(useMemo(() => LEVELS.filter((l) => ids.some((id) => levelOf(id) === l)), [ids]))
  const id = queue[at]
  const kanjiCard = !!id && isKanjiId(id)
  const kanji = useKanjiOf(kanjiCard ? id : null)
  useLevels(kanji ? LEVELS.filter((l) => kanji.words.some((w) => levelOf(w) === l)) : [])
  const word = !kanjiCard && id && levels.ready ? wordById(id) : null
  const example = useExample(kanjiCard ? null : id)
  const back = backOf(set)
  const ready = kanjiCard ? !!kanji : !!word

  const nextCard = (missed: boolean) => {
    if (missed && !again.has(id)) {
      setQueue((q) => [...q, id])
      setAgain((a) => new Set(a).add(id))
    }
    setAt((i) => i + 1)
    setOpen({ meaning: false, kana: false })
  }
  const allOpen = open.meaning && (open.kana || (!kanjiCard && !word?.r))

  if (!id) {
    return (
      <main className="study done-screen">
        <section className="done-body" aria-labelledby="done-title">
          <div className="done-mascot">
            <Ruma progress={1} mood="cheer" size={124} />
          </div>
          <h1 id="done-title">다시 보기 끝</h1>
          <dl className="done-figures two">
            <div>
              <dt>본 카드</dt>
              <dd>
                <b className="num">{ids.length}장</b>
              </dd>
            </div>
            <div>
              <dt>모르겠어요</dt>
              <dd>
                <b className="num">{again.size}장</b>
              </dd>
            </div>
          </dl>
        </section>
        <div className="done-actions">
          <Button label="돌아가기" variant="primary" size="lg" width="100%" onClick={() => go(back)} />
          <Button label="홈으로" size="lg" width="100%" onClick={() => go('/')} />
        </div>
      </main>
    )
  }

  const level = kanjiCard ? kanji?.level : word?.level
  return (
    <main className="study practice">
      <h1 className="sr-only">다시 보기</h1>
      <header className="study-top">
        <IconButton label="그만 보기" icon={<Icon name="close" />} onClick={() => go(back)} />
        <ProgressBar className="study-bar grow" label="다시 보기" value={at} max={queue.length} valueText={`${queue.length}장 중 ${at}장`} />
        <span className="left-count num-plain" aria-hidden="true">
          {at} / {queue.length}
        </span>
      </header>
      <p className="after-note" />
      <div className="card-area">
        <div className="card-stage">
          <div className="card-slot">
            {!ready && (
              <div className="skeleton" aria-busy="true" aria-label="단어를 불러오는 중">
                <Skeleton width={120} height={48} />
              </div>
            )}
            {ready && level !== undefined && (
              <section className={`flash ${kanjiCard ? 'kanji-card' : ''}`} key={`${id}:${at}`} aria-label={kanjiCard ? '한자 카드' : '단어 카드'}>
                <CardHead level={level} items={['다시 보기']} say={word ? word.r || word.w : undefined} marked={marks.includes(id)} onMark={() => toggleMark(id)} />
                {kanji && kanjiCard ? <KanjiFace kanji={kanji} kana={open.kana} meaningOpen={open.meaning} /> : word && <MeaningFace word={word} example={example} kana={open.kana} meaningOpen={open.meaning} />}
                <div className="flash-toggles" role="group" aria-label="카드 열기">
                  <Button label="의미" className="toggle" aria-pressed={open.meaning} onClick={() => setOpen((o) => ({ ...o, meaning: !o.meaning }))} />
                  <Button label="히라가나" className="toggle" aria-pressed={open.kana} isDisabled={!kanjiCard && !word?.r} onClick={() => setOpen((o) => ({ ...o, kana: !o.kana }))} />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      <footer className="answer-bar three" role="group" aria-label="얼마나 기억했나요">
        <GradeButton label="모르겠어요" isDisabled={!ready} onClick={() => (allOpen ? nextCard(true) : setOpen({ meaning: true, kana: true }))} />
        <GradeButton primary label="알아요" isDisabled={!ready} onClick={() => nextCard(false)} />
        <GradeButton label="쉬워요" isDisabled={!ready} onClick={() => nextCard(false)} />
      </footer>
    </main>
  )
}
