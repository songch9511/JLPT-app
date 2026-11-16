// Choosing the level (docs/design-system.md §3 "급수 고르기"): five cards, easiest first, each the level in its colour
// and how many words it has. The first run starts here (src/guide.ts); Home's level chip opens the same picker
// (`#/level`) to change the target level, as 설정 › 목표 급수 does.
import { go } from '../App'
import { UNOFFICIAL_LINE } from '../brand'
import { Icon } from '../components/Icon'
import { LevelBadge } from '../components/LevelBadge'
import { IconButton } from '../components/ui'
import { COUNTS, LEVELS, type Level } from '../data'
import { chooseLevel } from '../guide'
import { update, useStore } from '../store'

const f = (n: number) => n.toLocaleString('ko-KR')

/** `first`: the first run (the app's name above, the unofficial line below); otherwise a page with a way back. */
export function LevelPicker({ first = false }: { first?: boolean }) {
  const target = useStore((s) => s.settings.target)
  const choose = (l: Level) => {
    if (first) return chooseLevel(l)
    update((d) => void (d.settings.target = l))
    go('/')
  }
  return (
    <div className="level-picker">
      <header className="top picker-head">
        {first ? (
          <h1>JLPT 루마</h1>
        ) : (
          <>
            <IconButton label="홈으로" href="#/" icon={<Icon name="back" />} />
            <h1 className="grow">급수</h1>
          </>
        )}
      </header>
      <h2 className="group-title" id="picker-title">
        준비하는 급수
      </h2>
      <div className="picker-levels" role="group" aria-labelledby="picker-title">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className="picker-level"
            aria-label={`N${l}, ${f(COUNTS[l])}단어`}
            aria-current={!first && l === target ? 'true' : undefined}
            onClick={() => choose(l)}
          >
            <LevelBadge level={l} className="lg" />
            <span className="picker-count">{f(COUNTS[l])}단어</span>
            {!first && l === target && <Icon name="check" size={20} strokeWidth={2.6} />}
          </button>
        ))}
      </div>
      {first && <p className="first-note">{UNOFFICIAL_LINE}</p>}
    </div>
  )
}
