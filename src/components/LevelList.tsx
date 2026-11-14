import { COUNTS, LEVELS, type Level } from '../data'
import type { Breakdown } from '../srs'
import { Icon } from './Icon'
import { Group } from './ui'

export function StageBar({ b, total }: { b: Breakdown; total: number }) {
  return (
    <div className="bar stagebar" aria-hidden="true">
      <i className="mature" style={{ width: `${(b.mature / total) * 100}%` }} />
      <i className="young" style={{ width: `${(b.young / total) * 100}%` }} />
      <i className="learning" style={{ width: `${(b.learning / total) * 100}%` }} />
    </div>
  )
}

/** One row per level with its memory stages, on the ground with a hairline below; the target level says "목표". */
export function LevelList({ all, target }: { all: Record<Level, Breakdown>; target: Level }) {
  return (
    <Group title="급수별 기억 상태" id="levels-title" className="level-group">
      <div className="legend" aria-hidden="true">
        <span className="mature">장기 기억</span>
        <span className="young">다지는 중</span>
        <span className="learning">익히는 중</span>
      </div>
      <div className="levels">
        {LEVELS.map((l) => (
          <a
            key={l}
            href={`#/level/${l}`}
            className={`level-row ${l === target ? 'target' : ''}`}
            aria-label={`N${l}${l === target ? ' 목표' : ''}, ${COUNTS[l].toLocaleString()}개 중 ${(COUNTS[l] - all[l].new).toLocaleString()}개 만남, 장기 기억 ${all[l].mature.toLocaleString()}개`}
          >
            <div className="level-name">
              <b>N{l}</b>
              {l === target && <span className="level-target">목표</span>}
            </div>
            <StageBar b={all[l]} total={COUNTS[l]} />
            <span className="level-count">
              {(COUNTS[l] - all[l].new).toLocaleString()} / {COUNTS[l].toLocaleString()}
            </span>
            <Icon name="chevron" size={18} />
          </a>
        ))}
      </div>
    </Group>
  )
}
