import type { MouseEvent } from 'react'
import { Icon } from './Icon'

/** A reading choice once the card is answered: the right one, the one picked wrong, or one of the others. */
export type ChoiceState = '' | 'right' | 'wrong' | 'dim'

/**
 * One of a reading card's four choices (Study.tsx, PastCard.tsx). Before the answer it is pressable (a flat face on a
 * shallow edge). Answered, every choice loses the edge; the right one is a soft 緑青 tint with ✓, the one picked wrong
 * keeps the plain face with ✕, struck through in 弁柄 — the marks and the names carry it, never the colour alone.
 */
export function ReadingChoice({ text, state, disabled, onClick }: { text: string; state: ChoiceState; disabled: boolean; onClick?: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      lang="ja"
      className={`choice ${state}`}
      disabled={disabled}
      aria-label={state === 'right' ? `${text}, 정답` : state === 'wrong' ? `${text}, 고른 답, 오답` : text}
      onClick={onClick}
    >
      {(state === 'right' || state === 'wrong') && (
        <span className="choice-mark">
          <Icon name={state === 'right' ? 'check' : 'close'} size={18} strokeWidth={2.4} />
        </span>
      )}
      <span className="choice-text">{text}</span>
    </button>
  )
}
