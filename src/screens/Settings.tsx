import { lazy, Suspense, useRef, useState } from 'react'
import { exportBackup, readBackup, useMeta } from '../backup'
import { APP_VERSION, TITLE, UNOFFICIAL_NOTICE } from '../brand'
import { Banner, Button, Card, Choice, ConfirmDialog, MessageDialog, RowLink, Switch } from '../components/ui'
import { LEVELS } from '../data'
import { replayTips } from '../guide'
import { canUndoImport, importState, MAX_DAILY_NEW, orphanCount, resetAll, undoImport, update, useStore, type State } from '../store'
import { platform } from '../platform'
import { docHref, type DocName } from './Doc'
import { formatDay } from '../util'

// reminders, haptics and voice: only in the iOS app (not even in the web bundle, see src/platform/index.ts)
const NativeSettings = import.meta.env.MODE === 'native' ? lazy(() => import('../platform/NativeSettings')) : null

/**
 * The privacy policy and support pages (App Review 5.1.1(i)): on the web the site's own pages in a new window; in the
 * iOS app the same files from the app bundle, shown in place (screens/Doc.tsx) so they open offline.
 */
function DocLink({ doc, label }: { doc: DocName; label: string }) {
  return platform.native ? <RowLink href={`#/doc/${doc}`} label={label} /> : <RowLink href={docHref(doc)} label={label} newWindow />
}

export function Settings() {
  const st = useStore((s) => s.settings)
  const meta = useMeta()
  const orphans = useStore(orphanCount)
  const file = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<State['settings']>) => update((d) => void Object.assign(d.settings, patch))
  /** in-app dialogs instead of the browser's confirm()/alert() (05 batch 4) */
  const [confirmReset, setConfirmReset] = useState(false)
  const [pending, setPending] = useState<State | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const onboarded = useStore((s) => s.onboarded)
  const [replayed, setReplayed] = useState(false)

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
      setProblem(
        read.reason === 'newer'
          ? platform.native
            ? '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 다시 가져와 주세요.'
            : '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 새로고침한 뒤 다시 가져와 주세요.'
          : 'JLPT 루마 백업 파일이 아니에요.',
      )
      return
    }
    setPending(read.state)
  }

  return (
    <>
      <header className="top">
        <h1>설정</h1>
      </header>

      <Card className="form" role="region" aria-labelledby="learn-title">
        <h2 className="card-title" id="learn-title">학습 계획</h2>
        <p className="field-label">목표 급수</p>
        <Choice label="목표 급수" value={st.target} options={LEVELS.map((l) => [l, `N${l}`])} onChange={(target) => set({ target })} />
        {st.target < 5 && (
          <Switch
            label={`아래 급수 단어도 함께 (N${LEVELS.filter((l) => l > st.target).join('·N')})`}
            description="JLPT의 각 급수는 아래 급수 단어를 안다고 보고 나와요. 켜면 쉬운 급수부터 새 단어가 나와요."
            value={st.includeLower}
            onChange={(includeLower) => set({ includeLower })}
          />
        )}
        <p className="field-label">하루 새 단어</p>
        <Choice label="하루 새 단어" value={st.dailyNew} options={[5, 10, 20, 30, MAX_DAILY_NEW].map((n) => [n, String(n)])} onChange={(dailyNew) => set({ dailyNew })} />
        <p className="hint">
          지금 {st.dailyNew}개. 새 단어가 많을수록 며칠 뒤 복습도 늘어나요. 복습이 밀리지 않도록 하루 {MAX_DAILY_NEW}개까지만 정할 수
          있어요.
        </p>
      </Card>

      <Card className="form" role="region" aria-labelledby="method-title">
        <h2 className="card-title" id="method-title">학습 방식</h2>
        <Switch
          label="한자어 빠른 통과"
          description="한국어 한자어와 뜻이 같은 단어(産業 = 산업)는 뜻 대신 읽기를 4지선다로 물어요. 끄면 모든 단어를 뜻 카드로 배우고, 읽기로만 배운 단어도 뜻 카드로 새로 나와요. 다시 켜면 읽기 카드가 이어서 나와요."
          value={st.fastTrack}
          onChange={(fastTrack) => set({ fastTrack })}
        />
        {onboarded && (
          <p className="replay-tips" role="status">
            {replayed ? (
              '루마가 홈과 학습 화면에서 다시 알려 드릴게요.'
            ) : (
              <Button
                label="루마의 안내 다시 보기"
                variant="ghost"
                className="text-action"
                onClick={() => {
                  replayTips()
                  setReplayed(true)
                }}
              />
            )}
          </p>
        )}
      </Card>

      <Card className="form" role="region" aria-labelledby="display-title">
        <h2 className="card-title" id="display-title">화면 · 소리</h2>
        <p className="field-label">테마</p>
        <Choice
          label="테마"
          value={st.theme}
          options={[
            ['system', '시스템'],
            ['light', '라이트'],
            ['dark', '다크'],
          ]}
          onChange={(theme) => set({ theme })}
        />
        <Switch
          label="카드가 나올 때 발음 자동 재생"
          value={st.autoSpeak}
          onChange={(autoSpeak) => set({ autoSpeak })}
        />
      </Card>

      {NativeSettings && platform.native && (
        <Suspense fallback={null}>
          <NativeSettings />
        </Suspense>
      )}

      <Card className="form" role="region" aria-labelledby="data-title">
        <h2 className="card-title" id="data-title">데이터</h2>
        <p className="hint">
          {platform.native
            ? '학습 기록은 이 기기에만 저장돼요. 기기를 바꾸기 전에 백업 파일을 내보내 두세요.'
            : '학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.'}
        </p>
        <p className="small last-backup">{meta.lastExport ? `마지막 백업: ${formatDay(meta.lastExport)}` : '아직 백업한 적이 없어요.'}</p>
        {orphans > 0 && (
          // records whose words this version does not know (store.ts `orphans`): kept, exported, never shown
          <p className="small muted orphans-note">이 버전에 없는 단어의 기록 {orphans.toLocaleString()}개도 지우지 않고 함께 보관하고 있어요. 백업 파일에도 담겨요.</p>
        )}
        {canUndoImport() && (
          <div role="status">
            <Banner
              status="success"
              title="백업 파일의 기록으로 바꿨어요."
              action={<Button label="가져오기 되돌리기" variant="ghost" className="text-action" onClick={() => undoImport()} />}
            />
          </div>
        )}
        <div className="row">
          <Button label="백업 내보내기" onClick={exportBackup} />
          <Button
            label="백업 가져오기"
            onClick={() => (platform.pickFile ? void platform.pickFile().then((t) => t !== null && importText(t)) : file.current?.click())}
          />
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
        <Button label="모든 기록 초기화" variant="destructive" onClick={() => setConfirmReset(true)} />
      </Card>

      <Card className="about" role="region" aria-labelledby="about-title">
        <h2 className="card-title" id="about-title">정보</h2>
        <p>
          <b>{TITLE}</b>
          <br />
          <span className="small muted">버전 {APP_VERSION}</span>
        </p>
        <nav className="about-links" aria-label="개인정보 처리방침과 도움말">
          <DocLink doc="privacy" label="개인정보 처리방침" />
          <DocLink doc="support" label="도움말 · 문의" />
        </nav>
        <p className="notice">{UNOFFICIAL_NOTICE}</p>
        <ul className="credits">
          <li>단어 목록: open-anki-jlpt-decks (MIT, tanos.co.uk 기반). JLPT는 공식 어휘 목록을 공개하지 않아서 비공식 목록이에요.</li>
          <li>한국어 뜻은 기계 번역이라 틀린 곳이 있을 수 있어요.</li>
          <li>복습 간격: FSRS (ts-fsrs, MIT)</li>
          <li>
            디자인 시스템:{' '}
            <a href="https://github.com/meta/astryx" target="_blank" rel="noreferrer">
              Astryx
            </a>{' '}
            (Meta, MIT) · 아이콘: Lucide (ISC)
          </li>
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
      </Card>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="모든 기록을 지울까요?"
        description="이 기기의 학습 기록과 설정을 모두 지우고 처음부터 시작해요. 되돌릴 수 없어요."
        actionLabel="모두 지우기"
        onAction={() => {
          setConfirmReset(false)
          resetAll()
        }}
      />
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title="백업으로 바꿀까요?"
        description="지금 기록을 백업 파일의 내용으로 바꿔요. 바꾼 뒤 이 화면에서 바로 되돌릴 수 있어요."
        actionLabel="백업으로 바꾸기"
        actionVariant="primary"
        onAction={() => {
          if (pending) importState(pending)
          setPending(null)
        }}
      />
      <MessageDialog title="가져오지 못했어요" message={problem} onClose={() => setProblem(null)} />
    </>
  )
}
