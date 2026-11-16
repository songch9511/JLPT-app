// The first run's three intro pages (docs/design-system.md §3 "처음 안내"): the card (look, then open the meaning), the
// grades (as much as you remembered), and the new words a day. One line and one short note each; 건너뛰기 skips to
// the end. `again`: opened from 설정 › 처음 안내 다시 보기 (`#/intro`), it goes back to 설정 when done.
import { useState } from 'react'
import { go } from '../App'
import { Icon } from '../components/Icon'
import { LevelBadge } from '../components/LevelBadge'
import { Ruma } from '../components/Ruma'
import { Button, IconButton } from '../components/ui'
import { backToLevel, finishIntro } from '../guide'
import { MAX_DAILY_NEW, update, useStore } from '../store'

export const DAILY_NEW = [5, 10, 20, 30, MAX_DAILY_NEW] as const
/** About how long a day takes once reviews have settled, for `n` new words a day (20 → 15분). */
export const minutesPerDay = (n: number) => Math.max(1, Math.round(n * 0.75))

export function Intro({ again = false }: { again?: boolean }) {
  const [step, setStep] = useState(0)
  const target = useStore((s) => s.settings.target)
  const daily = useStore((s) => s.settings.dailyNew)
  const finish = () => {
    if (again) go('/settings')
    else finishIntro()
  }
  const back = () => {
    if (step > 0) setStep(step - 1)
    else if (again) go('/settings')
    else backToLevel()
  }
  return (
    <div className="first-run intro">
      <header className="intro-head">
        <IconButton label="뒤로" icon={<Icon name="back" />} onClick={back} />
        <div className="intro-steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={`3단계 중 ${step + 1}`}>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <span className="intro-skip">{step < 2 && <Button label="건너뛰기" variant="ghost" className="skip" onClick={() => setStep(2)} />}</span>
      </header>
      <div className="intro-body">
        {step === 0 && (
          <>
            <div className="intro-card" aria-hidden="true">
              <LevelBadge level={target} className="sm" />
              <span lang="ja" className="intro-word">
                勉強
              </span>
              <span className="intro-q">?</span>
              <span className="intro-toggles">
                <span>의미</span>
                <span>히라가나</span>
              </span>
            </div>
            <div className="intro-text">
              <h1>단어를 보고 뜻을 떠올려요</h1>
              <p>모르면 의미를 눌러 봐요</p>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="intro-grades" aria-hidden="true">
              <Ruma progress={1} mood="idle" size={96} />
              <span className="intro-bar">
                <span className="g">
                  <b>모르겠어요</b>
                  <small>10분 뒤</small>
                </span>
                <span className="g primary">
                  <b>알아요</b>
                  <small>4일 뒤</small>
                </span>
                <span className="g">
                  <b>쉬워요</b>
                  <small>9일 뒤</small>
                </span>
              </span>
            </div>
            <div className="intro-text">
              <h1>기억난 만큼 눌러요</h1>
              <p>잘 알수록 다음 복습이 늦게 와요</p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="intro-text">
              <h1>하루 새 단어</h1>
              <p>설정에서 바꿀 수 있어요</p>
            </div>
            <div className="intro-daily">
              <div className="pills" role="group" aria-label="하루 새 단어">
                {DAILY_NEW.map((n) => (
                  <button key={n} type="button" className={`pill ${daily === n ? 'on' : ''}`} aria-pressed={daily === n} onClick={() => update((d) => void (d.settings.dailyNew = n))}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="intro-time">
                <span>하루 약</span>
                <b className="num">{minutesPerDay(daily)}분</b>
              </p>
            </div>
          </>
        )}
      </div>
      <div className="first-actions">
        <Button label={step < 2 ? '다음' : again ? '확인' : '시작하기'} variant="primary" size="lg" width="100%" className="first-go" onClick={() => (step < 2 ? setStep(step + 1) : finish())} />
      </div>
    </div>
  )
}
