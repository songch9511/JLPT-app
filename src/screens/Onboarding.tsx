import { useState } from 'react'
import { Ruma } from '../components/Ruma'
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
      <Ruma fill={1} size={120} />
      <p className="eyebrow">JLPT 루마</p>
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
          <b>공부할수록 루마가 차올라요</b>
          <span>카드를 넘길수록 루마에 색이 차오르고, 오늘 분량을 끝내면 가득 차요. XP와 연속 학습도 쌓여요.</span>
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
