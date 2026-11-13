// After the first finished day in the iOS app: explain reminders first, ask iOS for permission only on "알림 받기".
// Never shown on first launch, and only once (either answer is remembered; settings can still turn it on).
import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { enableReminders, reminderPermission } from './native'
import './native.css'
import { getPrefs, setPrefs, usePrefs } from './prefs'

export default function ReminderOffer() {
  const p = usePrefs()
  const [show, setShow] = useState(false)
  const [result, setResult] = useState<'granted' | 'denied' | null>(null)
  useEffect(() => {
    if (getPrefs().reminderAsked || getPrefs().reminders.enabled) return
    // iOS asks only once; if the learner already answered in system settings there is nothing to offer here
    void reminderPermission().then((perm) => setShow(perm === 'prompt'))
  }, [])

  if (result === 'granted')
    return (
      <p className="note reminder-offer" role="status">
        좋아요. 복습할 단어가 돌아온 날 {String(p.reminders.hour).padStart(2, '0')}:{String(p.reminders.minute).padStart(2, '0')}에 알려
        드릴게요. 시각은 설정에서 바꿀 수 있어요.
      </p>
    )
  if (result === 'denied')
    return (
      <p className="note reminder-offer" role="status">
        알림을 받지 않기로 했어요. 마음이 바뀌면 iPhone의 설정 › 알림 › JLPT 루마에서 켤 수 있어요.
      </p>
    )
  if (!show) return null
  return (
    <section className="card reminder-offer" aria-labelledby="offer-title">
      <h2 id="offer-title">
        <Icon name="info" size={18} /> 복습할 때가 되면 알려 드릴까요?
      </h2>
      <p className="muted small">
        간격 반복은 잊기 직전에 다시 볼 때 가장 오래 남아요. 복습할 단어가 돌아온 날에만, 저녁 8시에 하루 한 번 개수를 알려 드려요. 시각과
        쉬는 요일은 설정에서 바꿀 수 있어요.
      </p>
      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            setPrefs({ reminderAsked: true })
            setShow(false)
          }}
        >
          나중에
        </button>
        <button className="btn primary" onClick={async () => setResult((await enableReminders()) === 'granted' ? 'granted' : 'denied')}>
          알림 받기
        </button>
      </div>
    </section>
  )
}
