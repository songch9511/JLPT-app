// A card answered earlier in the study session, as the learner sees it after swiping back (Study.tsx, src/session.ts):
// the answer shown, the grade given marked in the bar, which changes it.
import { useMemo } from 'react'
import { Icon } from './Icon'
import { Button } from './ui'
import { ReadingChoice } from './Choices'
import { ExampleSentence } from './Example'
import { CardHead, CardScroll, Headword, MeaningFace, Slot } from './StudyCard'
import { Bridge, SoundHints } from './WordNotes'
import { isReadingCard, meaning, type Word } from '../data'
import { useExample } from '../examples'
import { readingOf } from '../distractors'
import { previewFrom, Rating, type Grade } from '../srs'
import type { Entry } from '../session'

/** "이전 3/12": the card's place among the session's answers. */
export const pastLabel = (index: number, total: number) => `이전 ${index + 1}/${total}`

/** An earlier card: everything open (reading, meaning, every furigana, the translation, the kanji row). */
export function PastCard({ entry, index, total, word, marked, lapses, onMark }: { entry: Entry; index: number; total: number; word: Word | null; marked: boolean; lapses: number; onMark: () => void }) {
  const reading = isReadingCard(entry.id)
  const quiz = entry.quiz
  const example = useExample(entry.id)
  if (!word) return <div className="flash past" />
  return (
    <div className={`flash past ${entry.grade === Rating.Again ? 'missed' : ''} ${reading ? 'reading-card' : ''}`}>
      {/* the card itself is unchanged by its grade: the grade given is the pressed button below */}
      <CardHead level={word.level} items={[pastLabel(index, total), reading && '읽기', lapses > 0 && `${lapses}번 잊음`]} word={word} marked={marked} onMark={onMark} />
      {quiz ? (
        <CardScroll>
          <div className="flash-body">
            <Headword word={word} />
            {/* what was picked stays as it was; the grade below is what counts */}
            <div className="choices" role="group" aria-label="읽기 선택지">
              {quiz.choices.map((c, i) => {
                const state = i === quiz.answer ? 'right' : i === quiz.picked ? 'wrong' : 'dim'
                return <ReadingChoice key={c} text={c} state={state} disabled />
              })}
            </div>
            <Slot on className="flash-answer">
              {word.sk && <Bridge word={word} reading={readingOf(word)} />}
              <p className="flash-meaning">{meaning(word)}</p>
              <SoundHints word={word} />
            </Slot>
            {example && (
              <div className="flash-example">
                <ExampleSentence example={example} headword={word.w} headwordReading translation />
              </div>
            )}
          </div>
        </CardScroll>
      ) : (
        <MeaningFace word={word} example={example} kana meaningOpen />
      )}
    </div>
  )
}

const LABEL: Partial<Record<Grade, string>> = { [Rating.Again]: '모르겠어요', [Rating.Good]: '알아요', [Rating.Easy]: '쉬워요' }

/**
 * The grades of a card answered earlier: the same buttons as when it was answered (a reading card asked with choices
 * has 모르겠어요 · 알아요, as its choice counted), each with the interval it gives from the time of that answer inside it. The
 * grade given looks pressed — sunk onto its edge, the green tint and ink with a green line, a ✓ and `aria-pressed` — never a second
 * filled primary; another one changes the answer.
 */
export function PastBar({ entry, onGrade }: { entry: Entry; onGrade: (g: Grade) => void }) {
  const intervals = useMemo(() => previewFrom(entry.before, new Date(entry.at)), [entry])
  const grades: Grade[] = entry.quiz ? [Rating.Again, Rating.Good] : [Rating.Again, Rating.Good, Rating.Easy]
  return (
    <footer className={`answer-bar past-bar ${grades.length === 3 ? 'three' : ''}`}>
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
