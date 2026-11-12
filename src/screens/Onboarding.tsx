import { useState } from 'react'
import { LEVELS, type Level } from '../data'
import { update } from '../store'
import { formatDay, upcomingExams } from '../util'

export function Onboarding() {
  const exams = upcomingExams(new Date(), 3)
  const [target, setTarget] = useState<Level>(5)
  const [exam, setExam] = useState(exams[0])
  const [daily, setDaily] = useState(20)

  return (
    <div className="onboard">
      <div className="done-art" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="eyebrow">카사네 · 重ね</p>
      <h1>잊기 전에 한 겹 더, JLPT 단어</h1>
      <ol className="how">
        <li>
          <b>잊을 때쯤 다시</b>
          <span>기억이 흐려지는 시점을 계산해서 그때 단어를 다시 보여 줘요.</span>
        </li>
        <li>
          <b>아는 단어는 점점 멀리</b>
          <span>기억할수록 며칠 → 몇 주 → 몇 달로 간격이 벌어져요. 모르면 금방 돌아와요.</span>
        </li>
        <li>
          <b>하루 분량만 하면 끝</b>
          <span>오늘 나온 복습과 새 단어만 넘기면 돼요. 중간에 나가도 그대로 이어져요.</span>
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
        <label>하루 새 단어</label>
        <div className="seg">
          {[10, 20, 30].map((n) => (
            <button key={n} className={daily === n ? 'on' : ''} onClick={() => setDaily(n)}>
              {n}개
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
            d.settings.dailyNew = daily
            d.onboarded = true
          })
        }
      >
        시작하기
      </button>
    </div>
  )
}
