import { useState } from 'react'
import { Ruma } from '../components/Ruma'
import { Button, ChipGroup, Choice, Switch } from '../components/ui'
import { LEVELS, type Level } from '../data'
import { update } from '../store'
import { formatDay, upcomingExams } from '../util'

export function Onboarding() {
  const exams = upcomingExams(new Date(), 3)
  const [target, setTarget] = useState<Level>(5)
  const [exam, setExam] = useState(exams[0])
  const [daily, setDaily] = useState(20)
  const [lower, setLower] = useState(true)

  return (
    <div className="onboard">
      <Ruma progress={1} size={120} />
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
          <b>공부하면 루마가 눈을 떠요</b>
          <span>학습을 시작하면 한쪽 눈을, 오늘 분량을 끝내면 두 눈을 다 떠요. XP와 연속 학습도 쌓여요.</span>
        </li>
      </ol>

      <div className="form">
        <p className="field-label">목표 급수</p>
        <Choice label="목표 급수" value={target} options={LEVELS.map((l) => [l, `N${l}`])} onChange={setTarget} />
        {target < 5 && (
          <Switch
            label={`아래 급수 단어도 함께 (N${LEVELS.filter((l) => l > target).join('·N')})`}
            description="시험은 아래 급수 단어를 안다고 보고 나와요. 쉬운 급수부터 새 단어가 나와요."
            value={lower}
            onChange={setLower}
          />
        )}
        <p className="field-label">하루 새 단어</p>
        <Choice label="하루 새 단어" value={daily} options={[10, 20, 30].map((n) => [n, `${n}개`])} onChange={setDaily} />
        <p className="field-label">시험일</p>
        <ChipGroup label="시험일" value={exam} options={exams.map((d) => [d, formatDay(d)])} onChange={setExam} />
      </div>

      <div className="onboard-action">
        <Button
          label="시작하기"
          variant="primary"
          size="lg"
          width="100%"
          onClick={() =>
            update((d) => {
              d.settings.target = target
              d.settings.examDate = exam
              d.settings.dailyNew = daily
              d.settings.includeLower = lower
              d.onboarded = true
            })
          }
        />
        <p className="onboard-note">JLPT 주최 기관(JF·JEES)과 관계없는 비공식 학습 앱이에요.</p>
      </div>
    </div>
  )
}
