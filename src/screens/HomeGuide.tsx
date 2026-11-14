// Ruma's first run on Home (src/guide.ts): in the sky Ruma says hello and asks the level; the answers are the sheet's
// buttons. Then the plan offers the first session. Ruma's line later carries the one in-context tip.
import { Announce, Button } from '../components/ui'
import { LEVELS } from '../data'
import { chooseLevel, type Tip } from '../guide'

/** The first-run question, under Ruma's hello. */
export const QUESTION = '어느 급수를 준비해요?'

/** The level answers: one row of five ordinary buttons (no primary: none is the default). */
export function LevelAnswers({ labelledBy }: { labelledBy: string }) {
  return (
    <div className="guide-answers level-answers" role="group" aria-labelledby={labelledBy}>
      {LEVELS.map((l) => (
        <Button key={l} label={`N${l}`} onClick={() => chooseLevel(l)} />
      ))}
    </div>
  )
}

/**
 * Each tip's words: once, at the moment it matters, in Ruma's voice (two short plain sentences at most). The
 * spaced-repetition tip stays because nothing else on the screen says it: words come back when they would be
 * forgotten, at growing intervals.
 */
export const TIPS: Record<Exclude<Tip, 'reading'>, string> = {
  srs: '본 단어는 잊을 때쯤 돌아와요. 기억할수록 간격이 길어져요.',
}

/** A tip in place of Ruma's line, with a quiet "알겠어요"; announced politely when it appears. */
export function TipLine({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="ruma-line tip">
      <p>{text}</p>
      <Button label="알겠어요" variant="ghost" className="text-action tip-close" onClick={onClose} />
      <Announce text={`루마: ${text}`} />
    </div>
  )
}
