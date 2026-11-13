import { COUNTS, LEVELS, type Level } from '../data'
import type { Breakdown } from '../srs'
import { Icon } from './Icon'

export function StageBar({ b, total }: { b: Breakdown; total: number }) {
  return (
    <div className="bar stagebar" aria-hidden="true">
      <i className="mature" style={{ width: `${(b.mature / total) * 100}%` }} />
      <i className="young" style={{ width: `${(b.young / total) * 100}%` }} />
      <i className="learning" style={{ width: `${(b.learning / total) * 100}%` }} />
    </div>
  )
}

/** One row per level with its memory stages; the target level is marked. */
export function LevelList({ all, target }: { all: Record<Level, Breakdown>; target: Level }) {
  return (
    <section aria-labelledby="levels-title">
      <h2 className="section-title" id="levels-title">
        급수별 기억 상태
      </h2>
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
            aria-label={`N${l}${l === target ? ' 목표' : ''}, ${COUNTS[l]}개 중 ${COUNTS[l] - all[l].new}개 만남, 장기 기억 ${all[l].mature}개`}
          >
            <div className="level-name">
              <b>N{l}</b>
              {l === target && <span className="chip accent">목표</span>}
            </div>
            <StageBar b={all[l]} total={COUNTS[l]} />
            <span className="level-count">
              {COUNTS[l] - all[l].new} / {COUNTS[l]}
            </span>
            <Icon name="chevron" size={18} />
          </a>
        ))}
      </div>
    </section>
  )
}
