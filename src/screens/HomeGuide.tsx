// Ruma's first run on Home (src/guide.ts): the mascot card asks the level, with the answers as buttons right under the
// bubble; then it offers the first session. The same card later carries the in-context tips.
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react'
import { go } from '../App'
import { Ruma } from '../components/Ruma'
import { Announce, Button, Card } from '../components/ui'
import { LEVELS } from '../data'
import { askLevelAgain, chooseLevel, type Phase, type Tip } from '../guide'
import type { State } from '../store'

/** The mascot and its bubble: the bubble can take focus, so what comes next is read when an answer moves on to it. */
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
 * The first run's card at the top of Home: "어느 급수를 준비해요?" → the first session. The answer is saved at once, so a
 * reload continues where the learner was; the level can also be changed in 설정.
 */
export function GuideCard({ s, phase, fresh, minutes }: { s: State; phase: Exclude<Phase, null>; fresh: number; minutes: number }) {
  const qid = useId()
  const bubble = useRef<HTMLDivElement>(null)
  const shown = useRef(phase)
  // an answer replaces the buttons that had focus: focus goes to the bubble, which now holds what comes next (not
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

  // phase === 'start': the one primary on the screen
  return (
    <Card className="week-card guide-card" role="region" aria-label="루마">
      <Talk bubbleRef={bubble}>
        <p>
          좋아요, <b>N{target}</b>!{includeLower && lower.length > 0 && ` 쉬운 N${lower.join('·N')} 단어도 함께 나와요.`}
        </p>
        <p>
          오늘은 새 단어 <b>{fresh}개</b>, {minutes}분쯤이에요. 시작하면 제가 한쪽 눈을 떠요.
        </p>
      </Talk>
      <Button label="첫 학습 시작" variant="primary" size="lg" width="100%" onClick={() => go('/study')} />
      <Button label="급수 다시 고르기" variant="ghost" className="text-action guide-back" onClick={askLevelAgain} />
    </Card>
  )
}

/** Each tip's words: short, once, at the moment it matters. */
export const TIPS: Record<Exclude<Tip, 'reading'>, string> = {
  srs: '잘했어요! 오늘 본 단어는 잊을 때쯤 다시 가져올게요. 기억할수록 며칠, 몇 주, 몇 달로 간격이 벌어져요.',
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

/** While Ruma asks: the plan card's place and title, without numbers that mean nothing yet. */
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
