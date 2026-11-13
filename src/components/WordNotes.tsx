import { TYPE_LABEL, type Word } from '../data'
import { soundHints } from '../sound'
import { Icon } from './Icon'

/** The false-friend warning (k = F): shown once the meaning is visible, never before. */
export function FalseFriend({ word }: { word: Word }) {
  if (word.k !== 'F' || !word.ff) return null
  return (
    <div className="false-friend" role="note">
      <b>
        <Icon name="alert" size={16} /> 한국어와 뜻이 달라요
      </b>
      <span>{word.ff}</span>
    </div>
  )
}

/**
 * One quiet line: the word type and, for Sino words, the Korean hanja reading ("일본 한자어 · 심배").
 * F words carry the warning instead; unlabelled words show nothing.
 */
export function TypeLine({ word }: { word: Word }) {
  if (!word.k || word.k === 'F') return null
  const sino = word.k === 'S' || word.k === 'J'
  return (
    <p className="type-line">
      {TYPE_LABEL[word.k]}
      {sino && word.sk && (
        <>
          {' · '}
          <span lang="ko">{word.sk}</span>
        </>
      )}
    </p>
  )
}

/** "産業 = 산업 → さんぎょう": the Korean word the learner already knows, then the Japanese reading. */
export function Bridge({ word, reading }: { word: Word; reading: string }) {
  return (
    <p className="bridge">
      <span lang="ja">{word.w}</span> = <b lang="ko">{word.sk}</b> → <span lang="ja" className="bridge-ja">{reading}</span>
    </p>
  )
}

/** Korean–Japanese sound correspondences, only where they are known to hold (src/sound.ts). */
export function SoundHints({ word }: { word: Word }) {
  const hints = soundHints(word)
  if (!hints.length) return null
  return (
    <ul className="sound-hints" aria-label="한자음 대응">
      {hints.slice(0, 3).map((h) => (
        <li key={h.kanji + h.ja}>
          <span lang="ja">{h.kanji}</span> {h.ko} → <span lang="ja">{h.ja}</span>
          <small>{h.rule}</small>
        </li>
      ))}
    </ul>
  )
}
