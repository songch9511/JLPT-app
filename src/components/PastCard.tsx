// A card answered earlier in the study session, as the learner sees it after swiping back (Study.tsx, src/session.ts):
// everything open, the grade given marked in the bar, which changes it.
import { useMemo } from 'react'
import { Icon } from './Icon'
import { Button } from './ui'
import { CardHead, KanjiFace, MeaningFace, useKanjiOf } from './StudyCard'
import type { Word } from '../data'
import { useExample } from '../examples'
import { isKanjiId } from '../kanji'
import { previewFrom, Rating, type Grade } from '../srs'
import type { Entry } from '../session'

/** "이전 11 / 12": the card's place among the session's answers. */
export const pastLabel = (index: number, total: number) => `이전 ${index + 1} / ${total}`

/** An earlier card: everything open (reading, meaning, every furigana, the translation, the kanji). */
export function PastCard({ entry, index, total, word, marked, lapses, onMark }: { entry: Entry; index: number; total: number; word: Word | null; marked: boolean; lapses: number; onMark: () => void }) {
  const kanjiCard = isKanjiId(entry.id)
  const kanji = useKanjiOf(kanjiCard ? entry.id : null)
  const example = useExample(kanjiCard ? null : entry.id)
  if (kanjiCard) {
    if (!kanji) return <div className="flash past" />
    return (
      <div className="flash past kanji-card">
        <CardHead level={kanji.level} items={[pastLabel(index, total), lapses > 0 && `${lapses}번 잊음`]} marked={marked} onMark={onMark} />
        <KanjiFace kanji={kanji} kana meaningOpen />
      </div>
    )
  }
  if (!word) return <div className="flash past" />
  return (
    <div className={`flash past ${entry.grade === Rating.Again ? 'missed' : ''}`}>
      {/* the card itself is unchanged by its grade: the grade given is the pressed button below */}
      <CardHead level={word.level} items={[pastLabel(index, total), lapses > 0 && `${lapses}번 잊음`]} marked={marked} onMark={onMark} />
      <MeaningFace word={word} example={example} kana meaningOpen />
    </div>
  )
}

const LABEL: Partial<Record<Grade, string>> = { [Rating.Again]: '모르겠어요', [Rating.Good]: '알아요', [Rating.Easy]: '쉬워요' }

/**
 * The grades of a card answered earlier: the same three buttons as when it was answered, each with the interval it
 * gives from the time of that answer inside it. The grade given looks pressed — sunk onto its edge, outlined in ink,
 * a ✓ and `aria-pressed` — never a second filled primary; another one changes the answer.
 */
export function PastBar({ entry, onGrade }: { entry: Entry; onGrade: (g: Grade) => void }) {
  const intervals = useMemo(() => previewFrom(entry.before, new Date(entry.at)), [entry])
  const grades: Grade[] = [Rating.Again, Rating.Good, Rating.Easy]
  return (
    <footer className="answer-bar past-bar three">
      {grades.map((g) => {
        const on = entry.grade === g
        const after = intervals[g].endsWith('이내') ? intervals[g] : `${intervals[g]} 뒤`
        return (
          <Button key={g} label={`${LABEL[g]}, ${after} 다시`} variant="secondary" size="lg" className="grade" aria-pressed={on} onClick={() => onGrade(g)}>
            <span className="grade-label">
              {on && <Icon name="check" size={16} strokeWidth={2.6} />}
              {LABEL[g]}
            </span>
            <span className="grade-after" aria-hidden="true">
              {after}
            </span>
          </Button>
        )
      })}
    </footer>
  )
}
