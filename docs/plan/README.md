# JLPT 루마 — 제품 현황과 문서 안내

고침 2026-11-14. 처음(2026-11-13)에는 제품화 작업의 브리프였고, 지금은 **제품이 어떤 상태인지와 문서가 어디 있는지**를 적은 입구 문서입니다. 숫자·결정의 근거는 각 문서에 있고, 여기서는 가리키기만 합니다.

## 제품 현황 (2026-11-14)

- **제품**: 한국어 화자를 위한 JLPT 단어 앱 **JLPT 루마**(마스코트 다루마 "루마"). 코드·저장 키의 옛 이름 `kasane`는 기존 기록을 찾기 위해 남겨 둡니다(`src/brand.ts`). 버전은 `package.json`의 **1.0.0** 하나(설정 › 정보, 백업 파일, iOS `MARKETING_VERSION`이 같은 값).
- **배포**: 웹은 https://songch9511.github.io/JLPT-app/ (GitHub Pages, PWA, 저장소 공개). iOS 앱은 Capacitor 셸로 만들었고 **아직 App Store에 내지 않았습니다**(`docs/store/checklist.md`).
- **스택**: React 19 + Vite + TypeScript, 해시 라우팅. 상태는 기기 안에만: 웹은 `localStorage`(`kasane.state.v4`), iOS 앱은 그것과 앱 폴더의 내구 사본. 앱에는 백엔드·계정·분석 도구·결제가 없습니다.
- **학습 엔진**: FSRS 간격 반복(`ts-fsrs`). 앞면에서 "정답 보기" 뒤 모르겠어요 / 알아요 / 쉬워요. 하루 분량 = 돌아온 복습(밀리면 하루 상한으로 나눔) + 새 단어 N개(빈도순).
- **준비도**: 홈 첫 줄은 "시험날 기억할 단어(예상)" — FSRS 기억 확률로 시험날 아침에 기억할 단어 수를 추정하고, "지금 그만두면 / 계획대로면", 목표선(70·80·90%), "오늘 하면 +N"을 보여 줍니다. 합격 확률은 말하지 않습니다(03 §4).
- **한자어 빠른 통과**: 한국 한자어와 뜻이 같은 단어(産業 = 산업)는 뜻 대신 읽기를 4지선다로 묻는 읽기 카드(`<id>:r`), 뜻이 다른 한자어(大丈夫)는 경고. 단어 유형 태그와 한자음 대응 힌트는 08, 오답 보기는 11.
- **데이터**: N5~N1 8,130단어(open-anki-jlpt-decks, MIT, tanos.co.uk 기반). 한국어 뜻은 기계 번역(전수 검수 안 됨). 빈도 순서·유형 태그는 wordfreq·JMdict·KANJIDIC2·Unihan에서 만들어 CC BY-SA 4.0. 단어마다 **안정 ID**(`w000`…, `data/ids.json` 등록부, 08 §7) — 기록은 위치가 아니라 이 ID에 붙습니다.
- **AI**: 앱에 없습니다. **사용자가 API 키를 넣는 구조는 없앴습니다**. 단어 설명은 미리 생성해 정적 데이터로 낼 계획(09, 실행 안 함), 약한 단어 이야기는 서버(`server/`, 배포 안 함)를 거칠 계획이고, 그때까지 화면에 입구가 없습니다(`src/content.ts`).
- **게임 요소**: XP(카드당 10), 연속 학습, "오늘 분량 끝내기" 퀘스트 하나, 50단어마다 도장 찍히는 여정, 진행할수록 눈을 뜨는 루마.
- **디자인**: 일본 전통색 테마 `ruma`(Astryx 테마 형식, 토큰이 유일한 출처), 직접 만든 가벼운 컨트롤 + 따로 불러오는 Astryx 대화상자·시트, Lucide 아이콘, 묶음마다 프라이머리 하나, `word-break: keep-all`, 최소 iOS 16.4 — `docs/design-system.md`.
- **iOS 앱 기능**: 복습 알림(로컬), 홈 화면 위젯, 기기 일본어 음성, 햅틱, 공유 시트 백업·문서 선택기 가져오기, 오프라인 첫 실행, 앱 안에서 여는 처리방침·도움말(10, `src/platform/`, `src/screens/Doc.tsx`).
- **테스트**: 단위(Vitest, `tests/unit/`)와 E2E(Playwright, 휴대폰 화면, 웹 + 가짜 Capacitor로 돌리는 iOS 빌드, `tests/e2e/`), CI(`.github/workflows/ci.yml`), iOS 서명 없는 컴파일(`ios.yml`). 실제 iPhone에서는 아직 아무도 돌려 보지 않았습니다(10 §5 기기 체크리스트).

## 주요 파일

| 파일 | 내용 |
| --- | --- |
| `src/srs.ts`, `src/readiness.ts`, `src/projection.ts`, `src/pnew.ts` | 스케줄러·오늘의 큐·밀린 복습 나누기, 준비도와 "+N" 계산 |
| `src/store.ts`, `src/ids.ts`, `src/backup.ts` | 상태 구조·저장·이전(v2/v3 → v4), 단어 ID, 백업 내보내기·가져오기 |
| `src/data.ts`, `src/distractors.ts` | 단어 데이터 불러오기, 읽기 카드 오답 보기 |
| `src/screens/*.tsx` | Home, Study, Level, Words, Stats(기록), Settings, Onboarding, Doc(처리방침·도움말) |
| `src/components/ui.tsx`, `overlays.tsx`, `Ruma.tsx` | 컨트롤, Astryx 대화상자·시트, 마스코트 |
| `src/themes/ruma/` | 테마 원본과 빌드 결과(`npm run theme`) |
| `src/platform/` | 웹과 iOS 앱이 다른 곳 하나(알림, 음성, 햅틱, 파일, 내구 저장, 위젯) |
| `scripts/build-data.mjs`, `scripts/enrich/`, `scripts/word-ids.mjs` | 단어 데이터·보강 열·ID 등록부 (`npm run data`) |
| `scripts/build-pages.mjs` | `docs/store/`의 처리방침·도움말 → `public/privacy/`, `public/support/` (`npm run pages`) |
| `scripts/explain/` | 단어 설명 배치 생성(09) |
| `server/` | 루마 플러스 권한·이야기 생성 Cloudflare Worker(배포 안 함) |
| `ios/`, `capacitor.config.ts` | iOS 프로젝트(번들 ID는 아직 자리표시자 `com.example.jlptruma` — 소유자 결정) |

## 문서 안내

| 문서 | 내용 | 상태 (2026-11-14) |
| --- | --- | --- |
| [01-business-model.md](01-business-model.md) | 무료 + 평생 이용권 "루마 플러스", 가격, AI 원가, RevenueCat·Cloudflare 구조 | 계획. 1.0은 무료로 내고 결제는 사업자등록 뒤(06·checklist G) |
| [02-differentiation.md](02-differentiation.md) | 경쟁 분석, 포지셔닝(한자어 지름길 + 정직한 시험날 추정), 만들지 않을 것 | 기둥 두 개 모두 구현됨. 이름 권고("JLPT"를 브랜드에 넣지 말 것)와 달리 이름은 JLPT 루마 — 위험은 `docs/store/review-notes.md` §2 |
| [03-curriculum-dashboard.md](03-curriculum-dashboard.md) | 준비도 지표, 빈도 순서, 읽기 카드, 세션 설계 명세 | 단계 1·4 완료, 단계 3 일부(밀린 복습 나누기, 다단계 +N). 남은 것은 문서 끝 "구현 현황" |
| [04-qa-report.md](04-qa-report.md) | 테스트 도입, 버그 11개 수정, 열린 위험 O1~O4 | 완료. O2(오류 화면)·O4(위치 ID)는 이후 해결(08 §7), 숫자는 작성 당시 값 |
| [05-ux-design-review.md](05-ux-design-review.md) | 화면별 UX 진단과 묶음별 개선안 | 1~3묶음과 4묶음 일부 구현(문서 끝 "구현 현황"), 디자인 규칙은 `docs/design-system.md`로 옮김 |
| [06-app-store.md](06-app-store.md) | PWA → Capacitor iOS 앱 경로, 심사 요건, 계정·서류·일정 | 계획 문서. 실행 순서는 `docs/store/checklist.md` |
| [07-security-operations.md](07-security-operations.md) | 정적 앱 보안 점검, 백엔드 구조, 운영 | 점검은 작성 당시 코드 기준(API 키 구조는 이후 제거). 백엔드는 `server/`로 구현, 배포 안 함 |
| [08-word-data.md](08-word-data.md) | 빈도 순서, 단어 유형 태그, 데이터 재생성, **안정 단어 ID**(§7) | 완료. 결정 5(옛 파일 지우는 시점) 남음 |
| [09-explanations.md](09-explanations.md) | 8,130단어 설명 배치 생성 파이프라인 | 코드·테스트만. 실제 호출·검수 안 함 |
| [10-ios-build.md](10-ios-build.md) | Capacitor iOS 빌드, 네이티브 기능, 소유자 경로, 기기 체크리스트 | 코드 완료, iOS 기기·TestFlight 미실행. 번들 ID는 소유자 결정(결정 1) |
| [11-distractors.md](11-distractors.md) | 읽기 카드 오답 보기 측정과 개선 | 완료 |
| [13-qa-round2.md](13-qa-round2.md) | 출시 후보 QA 2차: 탐색 테스트, 숫자 일치 표, 접근성·성능 수치, 기기 점검 20분 체크리스트 | 완료. major 3개·minor 7개 수정, 남은 minor는 문서 끝 결정 |
| [../design-system.md](../design-system.md) | 테마 토큰, 컴포넌트, 규칙, 무게, iOS 16.4 | 현행 기준 문서 |
| [../store/](../store/) | App Store 제출 자료 | 아래 표 |

`docs/store/`:

| 문서 | 내용 | 상태 |
| --- | --- | --- |
| [checklist.md](../store/checklist.md) | 제출까지 할 일(소유자·엔지니어), 막힌 결정 D1~D6 | 진행 중. C3·C4(처리방침·도움말 페이지와 앱 안 링크) 완료 |
| [listing-ko.md](../store/listing-ko.md) | 이름·부제·설명·키워드·연령 등급 | 초안. 이름(D1) 소유자 결정 |
| [privacy-policy-ko.md](../store/privacy-policy-ko.md), [privacy-policy-en.md](../store/privacy-policy-en.md) | 개인정보 처리방침(1부 지금, 2부 플러스 출시 후) | 초안, 법률 검토·운영자 정보 필요. 1부가 `npm run pages`로 `public/privacy/`에 게시됨(자리표시자 표시된 채) |
| [support-ko.md](../store/support-ko.md) | 도움말·문의 | 초안, 연락처 필요. `public/support/`에 게시됨 |
| [privacy-labels.md](../store/privacy-labels.md) | App Store 개인정보 라벨 답안, 필수 사유 API 확인 | 1.0 답안 확정("수집 안 함"), 매니페스트 코드 대조 완료 |
| [review-notes.md](../store/review-notes.md) | 심사 메모(붙여 넣기용), 예상 지적과 답변 | 준비됨. 연락처 칸 비어 있음 |
| [screenshots.md](../store/screenshots.md), [capture.mjs](../store/capture.mjs) | 스크린샷 계획과 생성 스크립트(6.9"·6.3", 8장씩) | 초안 이미지 있음(웹 빌드를 Chromium으로). 최종본은 기기·시뮬레이터 캡처 권장 |

## 문서 작성 규칙

- 한국어로, 결론과 추천을 맨 앞에 씁니다. 대안을 나열만 하지 말고 하나를 추천하고 이유를 답니다.
- 외부 사실(스토어 정책, 수수료, 가격, 경쟁 앱 기능)은 직접 찾아 확인하고 출처 링크와 확인 날짜를 답니다. 확인하지 못한 것은 "미확인"이라고 씁니다.
- 맨 끝에 **"결정이 필요한 것"** 절을 두고, 제품 주인이 정할 항목을 추천안과 함께 번호로 적습니다.
- 다른 문서와 겹치는 내용은 그 문서를 가리키기만 합니다. 구현하며 계획과 달라진 것은 해당 문서 끝 "구현 현황"에 날짜와 함께 적습니다.
- 문서는 400줄 이내로 씁니다.
