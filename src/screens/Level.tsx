import { go } from '../App'
import { Icon } from '../components/Icon'
import { COUNTS, KO_READY, stageCount, stageRange, type Level } from '../data'
import { startStage, useStore } from '../store'

export function LevelScreen({ level }: { level: Level }) {
  const lv = useStore((s) => s.levels[level])
  const session = useStore((s) => s.session)
  const n = stageCount(level)

  const open = (stage: number) => {
    if (session && session.level === level && session.stage === stage) return go('/study')
    if (session && !confirm(`진행 중인 N${session.level} ${session.stage + 1}장을 그만두고 새로 시작할까요?`)) return
    startStage(level, stage)
    go('/study')
  }

  return (
    <>
      <header className="top">
        <a className="icon-btn" href="#/" aria-label="뒤로">
          <Icon name="back" />
        </a>
        <div className="grow">
          <h1>JLPT N{level}</h1>
          <p className="muted">
            {lv.round}회독째 · {n}장 중 {lv.done}장 완료 · 단어 {COUNTS[level].toLocaleString()}개
          </p>
        </div>
      </header>

      {!KO_READY[level] && (
        <p className="note">이 급수는 아직 한국어 뜻이 준비되지 않아 영어 뜻으로 표시돼요.</p>
      )}

      <div className="stages">
        {Array.from({ length: n }, (_, i) => {
          const state = i < lv.done ? 'done' : i === lv.done ? 'now' : 'locked'
          const active = session?.level === level && session.stage === i
          return (
            <button key={i} className={`stage ${state}`} disabled={state === 'locked'} onClick={() => open(i)}>
              <span className="stage-no">{i + 1}장</span>
              <span className="stage-sub">
                {active
                  ? '진행 중'
                  : state === 'done'
                    ? '다시 하기'
                    : state === 'now'
                      ? `새 단어 ${stageRange(level, i).length}`
                      : ''}
              </span>
              <span className="stage-icon">
                {state === 'done' && <Icon name="check" size={18} />}
                {state === 'locked' && <Icon name="lock" size={16} />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="muted small center">
        각 장은 새 단어 50개에 바로 앞 장의 단어가 섞여 나와요.
        <br />
        모든 장을 끝내면 1회독, 다시 1장부터 다음 회독이 시작돼요.
      </p>
    </>
  )
}
