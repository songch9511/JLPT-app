// A card answered earlier in the study session, as the learner sees it after swiping back (Study.tsx, src/session.ts):
// the answer shown, the grade given marked in the bar, which changes it.
import { useMemo } from 'react'
import { Icon } from './Icon'
import { Button, IconButton, Meta } from './ui'
import { ReadingChoice } from './Choices'
import { Bridge, FalseFriend, SoundHints, TypeLine } from './WordNotes'
import { isReadingCard, meaning, type Word } from '../data'
import { readingOf } from '../distractors'
import { previewFrom, Rating, type Grade } from '../srs'
import type { Entry } from '../session'
import { speak } from '../util'

/** "이전 3/12": the card's place among the session's answers. */
export const pastLabel = (index: number, total: number) => `이전 ${index + 1}/${total}`

export function PastCard({ entry, index, total, word, marked, onMark }: { entry: Entry; index: number; total: number; word: Word | null; marked: boolean; onMark: () => void }) {
  const reading = isReadingCard(entry.id)
  const quiz = entry.quiz
  if (!word) return <div className="flash open past" />
  return (
    <div className={`flash open past ${entry.grade === Rating.Again ? 'missed' : ''} ${reading ? 'reading-card' : ''}`}>
      {/* the card itself is unchanged by its grade: the grade given is the pressed button below */}
      <div className="flash-head">
        <span className="flash-status grow">
          <Meta className="flash-meta" items={[pastLabel(index, total), reading && '읽기']} />
        </span>
        <IconButton label="발음 듣기" icon={<Icon name="speaker" />} onClick={() => speak(word.r || word.w)} />
        <IconButton label="북마크" className={marked ? 'marked' : undefined} aria-pressed={marked} icon={<Icon name="mark" fill={marked} />} onClick={onMark} />
      </div>
      <div className="flash-body">
        <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : ''}`}>
          {word.w}
        </p>
        {quiz ? (
          <>
            {/* what was picked stays as it was; the grade below is what counts */}
            <div className="choices" role="group" aria-label="읽기 선택지">
              {quiz.choices.map((c, i) => {
                const state = i === quiz.answer ? 'right' : i === quiz.picked ? 'wrong' : 'dim'
                return <ReadingChoice key={c} text={c} state={state} disabled />
              })}
            </div>
            <div className="flash-answer-slot">
              <div className="flash-answer">
                {word.sk && <Bridge word={word} reading={readingOf(word)} />}
                <p className="flash-meaning">{meaning(word)}</p>
                <SoundHints word={word} />
              </div>
            </div>
          </>
        ) : (
          <div className="flash-answer-slot">
            <div className="flash-answer">
              {word.r && (
                <p lang="ja" className="flash-reading">
                  {word.r}
                </p>
              )}
              <p className="flash-meaning">{meaning(word)}</p>
              <FalseFriend word={word} />
              <TypeLine word={word} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const LABEL: Partial<Record<Grade, string>> = { [Rating.Again]: '모르겠어요', [Rating.Good]: '알아요', [Rating.Easy]: '쉬워요' }

/**
 * The grades of a card answered earlier: the same buttons as when it was answered (a reading card asked with choices
 * has 모르겠어요 · 알아요, as its choice counted), each with the interval it gives from the time of that answer. The
 * grade given looks pressed — sunk onto its edge, the 白藍 tint and 藍 ink, a ✓ and `aria-pressed` — never a second
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
          <Button
            key={g}
            label={`${LABEL[g]}, ${after} 다시`}
            variant="secondary"
            size="lg"
            className="grade"
            aria-pressed={on}
            onClick={() => onGrade(g)}
          >
            <span className="grade-label">
              {on && <Icon name="check" size={16} />}
              {LABEL[g]}
            </span>
            <small>{intervals[g]}</small>
          </Button>
        )
      })}
    </footer>
  )
}
