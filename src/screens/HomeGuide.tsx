// Ruma's first run on Home (src/guide.ts): the mascot card asks, one question at a time, with the answers as buttons
// right under the bubble; then it offers the first session. The same card later carries the in-context tips.
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react'
import { go } from '../App'
import { Ruma } from '../components/Ruma'
import { Announce, Button, Card } from '../components/ui'
import { LEVELS } from '../data'
import { askLevelAgain, chooseExam, chooseLevel, done, type Phase, type Tip } from '../guide'
import type { State } from '../store'
import { parseDay, upcomingExams } from '../util'

const monthDay = (key: string) => {
  const d = parseDay(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
const yearMonthDay = (key: string) => `${parseDay(key).getFullYear()}년 ${monthDay(key)}`

/** The mascot and its bubble: the bubble can take focus, so a new question is read when an answer moves on to it. */
function Talk({ id, mood = 'idle', progress = 0, bubbleRef, children }: { id?: string; mood?: 'idle' | 'sleep' | 'cheer'; progress?: number; bubbleRef?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div className="week-top">
      <Ruma progress={progress} mood={mood} size={72} />
      <div className="bubble" id={id} ref={bubbleRef} tabIndex={bubbleRef ? -1 : undefined}>
        {children}
      </div>
    </div>
  )
}

/**
 * The first run's card at the top of Home: "어느 급수를 준비해요?" → "시험은 언제예요?" → the first session. Every answer
 * is saved at once, so a reload continues where the learner was; everything here can also be set in 설정.
 */
export function GuideCard({ s, phase, fresh, minutes }: { s: State; phase: Exclude<Phase, null>; fresh: number; minutes: number }) {
  const qid = useId()
  const bubble = useRef<HTMLDivElement>(null)
  const shown = useRef(phase)
  // an answer replaces the buttons that had focus: focus goes to the bubble, which now holds the next question (not
  // when Home opens: that is the learner's to start)
  useEffect(() => {
    if (shown.current === phase) return
    shown.current = phase
    bubble.current?.focus()
  }, [phase])

  const { target, includeLower } = s.settings
  const lower = LEVELS.filter((l) => l > target)

  if (phase === 'level')
    return (
      <Card className="week-card guide-card" role="region" aria-label="루마">
        <Talk id={qid} bubbleRef={bubble}>
          <p>
            <b>안녕하세요, 루마예요.</b> 어느 급수를 준비해요?
          </p>
          <p className="bubble-sub">처음이라면 N5부터 시작해요.</p>
        </Talk>
        <div className="guide-answers level-answers" role="group" aria-labelledby={qid}>
          {LEVELS.map((l) => (
            <Button key={l} label={`N${l}`} onClick={() => chooseLevel(l)} />
          ))}
        </div>
      </Card>
    )

  if (phase === 'exam') {
    const exams = upcomingExams(new Date(), 3)
    return (
      <Card className="week-card guide-card" role="region" aria-label="루마">
        <Talk id={qid} bubbleRef={bubble}>
          <p>
            좋아요, <b>N{target}</b>!{includeLower && lower.length > 0 && ` 쉬운 N${lower.join('·N')} 단어도 함께 나와요.`} 시험은 언제예요?
          </p>
        </Talk>
        <div className="guide-answers dates" role="group" aria-labelledby={qid}>
          {exams.map((d) => (
            <Button key={d} label={yearMonthDay(d)} onClick={() => chooseExam(d)} />
          ))}
          <Button label="아직 몰라요" onClick={() => chooseExam(null)} />
        </div>
        <Button label="급수 다시 고르기" variant="ghost" className="text-action guide-back" onClick={askLevelAgain} />
      </Card>
    )
  }

  // phase === 'start': the one primary on the screen
  return (
    <Card className="week-card guide-card" role="region" aria-label="루마">
      <Talk bubbleRef={bubble}>
        {done(s, 'exam-unknown') && <p className="bubble-sub">시험일은 일단 {monthDay(s.settings.examDate)}로 둘게요. 설정에서 바꿀 수 있어요.</p>}
        <p>
          준비됐어요! 오늘은 새 단어 <b>{fresh}개</b>, {minutes}분쯤이에요. 시작하면 제가 한쪽 눈을 떠요.
        </p>
      </Talk>
      <Button label="첫 학습 시작" variant="primary" size="lg" width="100%" onClick={() => go('/study')} />
    </Card>
  )
}

/** Each tip's words: short, once, at the moment it matters. */
export const TIPS: Record<Exclude<Tip, 'reading'>, string> = {
  srs: '잘했어요! 오늘 본 단어는 잊을 때쯤 다시 가져올게요. 기억할수록 며칠, 몇 주, 몇 달로 간격이 벌어져요.',
  ready: '복습이 쌓여서 이제 ‘시험날 기억할 단어’를 판단할 수 있어요. 시험날 떠올릴 단어 수의 어림이지, 합격 확률은 아니에요.',
}

/** A tip in the mascot's bubble with "알겠어요"; announced politely when it appears. */
export function TipBubble({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="bubble tip">
      <p>{text}</p>
      <Button label="알겠어요" variant="ghost" className="text-action tip-close" onClick={onClose} />
      <Announce text={`루마: ${text}`} />
    </div>
  )
}

/** While Ruma asks: what the dashboard will show, without numbers that mean nothing yet. */
export function ReadinessPending() {
  return (
    <Card className="readiness pending" role="region" aria-labelledby="ready-title">
      <h2 id="ready-title" className="card-title">
        시험날 기억할 단어
      </h2>
      <p className="ready-figure" aria-hidden="true">
        <b className="num">—</b>
      </p>
      <div className="progress" aria-hidden="true" />
      <p className="hint">급수와 시험일을 고르면 시험날 기억할 단어를 어림해서 보여 드려요.</p>
    </Card>
  )
}

export function PlanPending() {
  return (
    <Card className="plan pending" role="region" aria-labelledby="plan-title">
      <h2 id="plan-title" className="card-title">
        오늘의 계획
      </h2>
      <p className="hint">급수를 고르면 오늘 볼 새 단어를 정해 둘게요.</p>
    </Card>
  )
}
