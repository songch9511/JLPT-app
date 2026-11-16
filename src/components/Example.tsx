import type { Example } from '../examples'
import { headwordSegments } from '../examples'

/**
 * A word's example sentence (src/examples.ts): the Japanese with small furigana over its kanji, then the Korean
 * translation when `translation` is on (its line is there, empty, while it is off). The headword's own furigana would give a card's answer away: it is shown
 * only with `headwordReading` (the card's 히라가나, or a reading card once answered); every other kanji always has its
 * furigana, so the sentence can be read. A hidden reading keeps its room (`visibility`), so nothing moves when it
 * appears, and is not read out.
 */
export function ExampleSentence({ example, headword, headwordReading, translation }: { example: Example; headword: string; headwordReading: boolean; translation: boolean }) {
  const isHead = headwordSegments(headword, example.seg)
  return (
    <div className="example">
      <p lang="ja" className="example-ja">
        {example.seg.map(([text, reading], i) =>
          reading ? (
            <ruby key={i} className={isHead[i] ? 'example-head' : undefined}>
              {text}
              <rt className={isHead[i] && !headwordReading ? 'held' : undefined}>{reading}</rt>
            </ruby>
          ) : (
            <span key={i}>{text}</span>
          ),
        )}
      </p>
      {/* the translation's line is kept while it is closed, so the card does not move when it opens */}
      <p className={`example-ko slot ${translation ? 'on' : ''}`}>{example.ko}</p>
    </div>
  )
}
