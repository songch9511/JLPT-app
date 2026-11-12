import { useState } from 'react'
import { LEVELS, type Level } from '../data'
import { update } from '../store'
import { formatDay, upcomingExams } from '../util'

export function Onboarding() {
  const exams = upcomingExams(new Date(), 3)
  const [target, setTarget] = useState<Level>(5)
  const [exam, setExam] = useState(exams[0])

  return (
    <div className="onboard">
      <div className="done-art" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="eyebrow">카사네 · 重ね</p>
      <h1>겹겹이 쌓는 JLPT 단어</h1>
      <ol className="how">
        <li>
          <b>알아요 / 다시 볼게요</b>
          <span>카드마다 둘 중 하나만 고르면 돼요.</span>
        </li>
        <li>
          <b>모를수록 다시 만나요</b>
          <span>“다시 볼게요”한 단어는 “알아요”가 될 때까지 돌아와요.</span>
        </li>
        <li>
          <b>앞 장이 다음 장에 섞여요</b>
          <span>새 단어 50개 + 지난 장 50개. 끝까지 가면 1회독이에요.</span>
        </li>
      </ol>

      <div className="form">
        <label>목표 급수</label>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={target === l ? 'on' : ''} onClick={() => setTarget(l)}>
              N{l}
            </button>
          ))}
        </div>
        <label>시험일</label>
        <div className="chips">
          {exams.map((d) => (
            <button key={d} className={`chip-btn ${exam === d ? 'on' : ''}`} onClick={() => setExam(d)}>
              {formatDay(d)}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn primary big"
        onClick={() =>
          update((d) => {
            d.settings.target = target
            d.settings.examDate = exam
            d.onboarded = true
          })
        }
      >
        시작하기
      </button>
    </div>
  )
}
