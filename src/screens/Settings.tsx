import { lazy, Suspense, useRef } from 'react'
import { exportBackup, readBackup, useMeta } from '../backup'
import { TITLE, UNOFFICIAL_NOTICE } from '../brand'
import { LEVELS } from '../data'
import { canUndoImport, GOALS, importState, MAX_DAILY_NEW, resetAll, undoImport, update, useStore, type State } from '../store'
import { platform } from '../platform'
import { formatDay, upcomingExams } from '../util'

// reminders, haptics and voice: only in the iOS app (not even in the web bundle, see src/platform/index.ts)
const NativeSettings = import.meta.env.MODE === 'native' ? lazy(() => import('../platform/NativeSettings')) : null

export function Settings() {
  const st = useStore((s) => s.settings)
  const meta = useMeta()
  const file = useRef<HTMLInputElement>(null)
  const exams = upcomingExams(new Date(), 4)
  const set = (patch: Partial<State['settings']>) => update((d) => void Object.assign(d.settings, patch))

  const importData = async (f: File) => importText(await f.text())
  const importText = (text: string) => {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
    const read = readBackup(data)
    if (!read.ok) {
      alert(
        read.reason === 'newer'
          ? platform.native
            ? '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 다시 가져와 주세요.'
            : '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 새로고침한 뒤 다시 가져와 주세요.'
          : 'JLPT 루마 백업 파일이 아니에요.',
      )
      return
    }
    if (!confirm('지금 기록을 백업 파일의 내용으로 바꿀까요? 바로 되돌릴 수 있어요.')) return
    importState(read.state)
  }

  return (
    <>
      <header className="top">
        <h1>설정</h1>
      </header>

      <section className="card form">
        <h3>학습 목표</h3>
        <label>목표 급수</label>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={st.target === l ? 'on' : ''} aria-pressed={st.target === l} onClick={() => set({ target: l })}>
              N{l}
            </button>
          ))}
        </div>
        {st.target < 5 && (
          <label className="switch">
            <span>
              아래 급수 단어도 함께 (N{LEVELS.filter((l) => l > st.target).join('·N')})
              <small className="muted">시험은 아래 급수 단어를 안다고 보고 나와요. 켜면 쉬운 급수부터 새 단어가 나오고, 시험 준비도에도 함께 세요.</small>
            </span>
            <input type="checkbox" checked={st.includeLower} onChange={(e) => set({ includeLower: e.target.checked })} />
          </label>
        )}
        <label>하루 새 단어</label>
        <div className="seg">
          {[5, 10, 20, 30, MAX_DAILY_NEW].map((n) => (
            <button key={n} className={st.dailyNew === n ? 'on' : ''} aria-pressed={st.dailyNew === n} onClick={() => set({ dailyNew: n })}>
              {n}
            </button>
          ))}
        </div>
        <p className="muted small">
          지금 {st.dailyNew}개. 새 단어가 많을수록 며칠 뒤 복습도 늘어나요. 복습이 밀리지 않도록 하루 {MAX_DAILY_NEW}개까지만 정할 수
          있어요.
        </p>
        <label>시험날 목표</label>
        <div className="seg">
          {GOALS.map((g) => (
            <button key={g} className={st.goal === g ? 'on' : ''} aria-pressed={st.goal === g} onClick={() => set({ goal: g })}>
              {Math.round(g * 100)}%
            </button>
          ))}
        </div>
        <p className="muted small">시험날 기억할 단어의 목표 비율이에요. 합격선에서 나온 숫자가 아니라 앱이 정한 기준이에요.</p>
        <label htmlFor="exam">시험일</label>
        <div className="chips">
          {exams.map((d) => (
            <button key={d} className={`chip-btn ${st.examDate === d ? 'on' : ''}`} aria-pressed={st.examDate === d} onClick={() => set({ examDate: d })}>
              {formatDay(d)}
            </button>
          ))}
        </div>
        <input id="exam" type="date" value={st.examDate} onChange={(e) => e.target.value && set({ examDate: e.target.value })} />
      </section>

      <section className="card form">
        <h3>학습 방식</h3>
        <label className="switch">
          <span>
            한자어 빠른 통과
            <small className="muted">
              한국어 한자어와 뜻이 같은 단어(産業 = 산업)는 뜻 대신 읽기를 4지선다로 물어요. 끄면 모든 단어를 뜻 카드로 배우고, 읽기로만 배운
              단어도 뜻 카드로 새로 나와요. 다시 켜면 읽기 카드가 이어서 나와요.
            </small>
          </span>
          <input type="checkbox" checked={st.fastTrack} onChange={(e) => set({ fastTrack: e.target.checked })} />
        </label>
      </section>

      <section className="card form">
        <h3>화면 · 소리</h3>
        <label>테마</label>
        <div className="seg">
          {(
            [
              ['system', '시스템'],
              ['light', '라이트'],
              ['dark', '다크'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={st.theme === k ? 'on' : ''} aria-pressed={st.theme === k} onClick={() => set({ theme: k })}>
              {label}
            </button>
          ))}
        </div>
        <label className="switch">
          <span>카드가 나올 때 발음 자동 재생</span>
          <input type="checkbox" checked={st.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
        </label>
      </section>

      {NativeSettings && platform.native && (
        <Suspense fallback={null}>
          <NativeSettings />
        </Suspense>
      )}

      <section className="card form">
        <h3>데이터</h3>
        <p className="muted small">
          {platform.native
            ? '학습 기록은 이 기기에만 저장돼요. 기기를 바꾸기 전에 백업 파일을 내보내 두세요.'
            : '학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.'}
        </p>
        <p className="small last-backup">
          {meta.lastExport ? `마지막 백업: ${formatDay(meta.lastExport)}` : '아직 백업한 적이 없어요.'}
        </p>
        {canUndoImport() && (
          <p className="note row-note" role="status">
            <span className="grow">백업 파일의 기록으로 바꿨어요.</span>
            <button className="link" onClick={() => undoImport()}>
              가져오기 되돌리기
            </button>
          </p>
        )}
        <div className="row">
          <button className="btn ghost" onClick={exportBackup}>
            백업 내보내기
          </button>
          <button
            className="btn ghost"
            onClick={() => (platform.pickFile ? void platform.pickFile().then((t) => t !== null && importText(t)) : file.current?.click())}
          >
            백업 가져오기
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importData(f)
              e.target.value = ''
            }}
          />
        </div>
        <button
          className="btn danger"
          onClick={() => confirm('모든 학습 기록과 설정을 지울까요? 되돌릴 수 없어요.') && resetAll()}
        >
          모든 기록 초기화
        </button>
      </section>

      <section className="card about" aria-labelledby="about-title">
        <h3 id="about-title">정보</h3>
        <p>
          <b>{TITLE}</b>
        </p>
        <p className="notice">{UNOFFICIAL_NOTICE}</p>
        <ul className="muted small credits">
          <li>단어 목록: open-anki-jlpt-decks (MIT, tanos.co.uk 기반). JLPT는 공식 어휘 목록을 공개하지 않아서 비공식 목록이에요.</li>
          <li>한국어 뜻은 기계 번역이라 틀린 곳이 있을 수 있어요.</li>
          <li>복습 간격: FSRS (ts-fsrs, MIT)</li>
          <li>
            단어 빈도·소개 순서:{' '}
            <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noreferrer">
              wordfreq
            </a>{' '}
            (Robyn Speer, CC BY-SA 4.0. OpenSubtitles 2018, Wikipedia 등의 자료 포함)
          </li>
          <li>
            사전 데이터:{' '}
            <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" target="_blank" rel="noreferrer">
              JMdict
            </a>
            ·
            <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">
              KANJIDIC2
            </a>{' '}
            © Electronic Dictionary Research and Development Group (
            <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
              CC BY-SA
            </a>
            )
          </li>
          <li>
            한국 한자음:{' '}
            <a href="https://www.unicode.org/reports/tr38/" target="_blank" rel="noreferrer">
              Unicode Unihan
            </a>{' '}
            (Unicode License v3)
          </li>
          <li>
            이 자료로 만든 단어 빈도·순서·유형 데이터는{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko" target="_blank" rel="noreferrer">
              CC BY-SA 4.0
            </a>
            으로 배포해요(
            <a href={`${import.meta.env.BASE_URL}data/NOTICE.txt`} target="_blank" rel="noreferrer">
              고지문
            </a>
            ).
          </li>
        </ul>
      </section>
    </>
  )
}
