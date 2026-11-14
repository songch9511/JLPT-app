# App Store 제출 체크리스트 (1.0, 무료)

작성 2026-11-14. **[소유자]** = Apple 계정 소유자 본인만 할 수 있는 일(본인 확인, 계약, 법적 책임, 비밀값). **[엔지니어]** = 저장소 작업. 순서는 의존 관계 순입니다. 근거 문서는 괄호 안에 적었습니다(06 = `docs/plan/06-app-store.md`, 10 = `docs/plan/10-ios-build.md`).

## A. 먼저 정할 것 (막혀 있는 것)

| # | 결정 | 이 결정이 막는 것 | 이 폴더의 추천 |
| --- | --- | --- | --- |
| D1 | **스토어 이름** | 앱 레코드 생성(B4), 스크린샷 최종본, 지원·처리방침 페이지 제목 | `JLPT 루마 - 일본어 단어 N5~N1`(`listing-ko.md` §1). 06·02는 브랜드를 "루마"로 하고 JLPT를 뒤에 두라고 권했으므로, "JLPT"를 앞에 두는 위험을 감수하는지 소유자가 명시적으로 정해야 함 |
| D2 | **번들 ID**(한 번 정하면 못 바꿈) | B3, B4, App Group, 위젯, TestFlight 전부 | `io.github.songch9511.jlptruma`(10 결정 1). 도메인을 살 계획이면 지금 정하고 그 도메인으로 |
| D3 | 개인 / 조직 가입 | B1, 판매자 이름 = 저작권 표기 = 처리방침 운영자 이름 | 개인(06 결정 2) |
| D4 | 위젯을 1.0에 넣을지 | 설명·심사 메모·스크린샷의 위젯 문장 | 넣기(10 결정 4). `ios.yml`이 통과하고 기기에서 맞을 때만 |
| D5 | 처리방침·지원 페이지 연락처(이메일, 공개할 이름·주소 범위) | C1~C3, 지원 URL 요건 | 별도 지원용 이메일. 주소 공개 범위는 법률 검토 |
| D6 | 출시 국가 | 가격·사용 가능 여부 화면 | 대한민국만(06 결정 6) |

## B. 계정과 서명 (소유자)

- [ ] **B1 [소유자]** Apple 계정 이중 인증 → [Apple Developer Program](https://developer.apple.com/programs/enroll/) 개인 가입, 연 USD 99(06 §3.1). 승인까지 며칠 걸릴 수 있음.
- [ ] **B2 [소유자]** 비즈니스 › 대한민국 규정 준수 정보 입력(06 §3.3, O6). 무료 앱이어도 요구되는지는 화면에서 확인.
- [ ] **B3 [엔지니어]** D2가 정해지면 `npm run ios:set-id -- <번들 ID> --name "JLPT 루마"` → PR → `ios.yml`(서명 없는 컴파일) 통과 확인(10 §4 4단계). 지금 `capacitor.config.ts`의 `appId`는 자리표시자 `com.example.jlptruma`.
- [ ] **B4 [소유자]** App Store Connect › 앱 › 새로운 앱: iOS, 이름(D1), 기본 언어 한국어, 번들 ID, SKU. 자동 서명이 등록하지 않으면 Identifiers에서 `<id>`, `<id>.widget`, App Group `group.<id>`를 만들고 둘 다 App Groups 켜기(10 §4 5단계).
- [ ] **B5 [소유자]** App Store Connect API 팀 키 발급(역할: 관리자 — 앱 관리자로 충분한지는 미확인, 10 §4 6단계). `.p8`은 한 번만 내려받을 수 있음.
- [ ] **B6 [소유자] — `ios-testflight.yml` 비밀값**: GitHub › Settings › Environments › `testflight` 만들기(필수 검토자: 본인) → 비밀값 4개
  - `APPLE_TEAM_ID` — developer.apple.com › Membership details의 Team ID
  - `ASC_KEY_ID` — B5 키의 Key ID
  - `ASC_ISSUER_ID` — 같은 화면의 Issuer ID
  - `ASC_KEY_P8` — `.p8` 파일 내용 전체
  - 그리고 Settings › Secrets and variables › Actions › **Variables**에 `IOS_RELEASE_ENABLED` = `true`(이 값이 없으면 워크플로가 건너뜀).
  - 워크플로 이름과 비밀값 이름은 `.github/workflows/ios-testflight.yml`에서 확인함. **이 워크플로는 한 번도 실행된 적이 없음**(10 §4).
- [ ] **B7 [소유자]** Actions › "iOS TestFlight upload (signed, manual)" 실행. 입력값은 없습니다: 앱 버전은 `package.json`의 `version`(**1.0.0**) 하나이고, 워크플로가 그것을 읽어 `CFBundleShortVersionString`으로 씁니다. Xcode 프로젝트의 `MARKETING_VERSION`도 1.0.0이며 단위 테스트(`tests/unit/pages.test.ts`)가 둘이 같은지 확인합니다. 다음 버전은 둘을 함께 바꿉니다.

## C. 공개 페이지 (개인정보 처리방침·지원)

App Store Connect에 처리방침 URL과 지원 URL이 필수이고, 처리방침은 **앱 안에서도** 쉽게 열 수 있어야 합니다(가이드라인 5.1.1(i)). 깨진 링크는 흔한 리젝 사유입니다(06 §6).

- [ ] **C1 [소유자]** `privacy-policy-ko.md` 1부의 자리표시자 채우기 → **법률 검토**(처리방침 필수 항목, 기관 연락처 최신값) → 승인.
- [ ] **C2 [소유자]** `support-ko.md`의 연락처 채우기 → 승인.
- [x] **C3 [엔지니어] 게시 위치 — 지금의 GitHub Pages 배포에 함께 싣기** (2026-11-14 구현: `npm run pages`(`scripts/build-pages.mjs`)가 `privacy-policy-ko.md`·`privacy-policy-en.md`의 1부와 `support-ko.md`에서 아래 세 페이지를 만들고, 단위 테스트가 최신인지·2부가 없는지 확인합니다. 서비스 워커의 앱 대체 응답에서 빠져 있어 웹에서는 진짜 페이지로 열리고(미리 캐시라 오프라인도), iOS 앱은 같은 파일을 번들에 담아 앱 안 화면 `#/doc/privacy`로 보여 줍니다 — 오프라인에서 열리고 앱을 벗어나지 않음. 자리표시자 `[대괄호]`는 페이지에 노란 표시로 그대로 보이므로, C1·C2를 채운 뒤 `npm run pages`를 다시 실행하고 배포해야 합니다.) 처음 제안:
  - 이 저장소는 `deploy.yml`이 `dist/`를 `https://songch9511.github.io/JLPT-app/`에 올립니다. Vite는 `public/` 아래 파일을 그대로 `dist/`에 복사하므로:
    - `public/privacy/index.html` → **`https://songch9511.github.io/JLPT-app/privacy/`**(한국어), `public/privacy/en/index.html` → `…/privacy/en/`(영어)
    - `public/support/index.html` → **`https://songch9511.github.io/JLPT-app/support/`**
  - 장점: 추가 호스팅이 없고, 같은 파일이 iOS 앱 번들(`dist-native/`)에도 들어가 **오프라인에서도 앱 안에서 처리방침을 열 수 있음**. 다만 지금 앱의 번들 파일 시트(`native.ts`의 `showTextSheet`)는 내용을 일반 텍스트로 보여 주므로 HTML을 그대로 열면 태그가 보임 — 앱 안에서는 웹 주소를 앱 안 Safari 뷰로 열거나, 같은 내용의 `.txt`를 함께 두는 등 작은 조정이 필요.
  - 주의: 서비스 워커 precache에 HTML이 포함되므로 웹에서는 갱신이 한 번 늦게 보일 수 있음. 정적 HTML이라 앱 디자인 시스템을 쓸 필요는 없지만 라이트/다크 대응과 모바일 폭은 맞출 것.
  - 대안: 별도 저장소의 Pages(`songch9511.github.io/ruma-legal/…`)나 도메인을 사면 그 도메인. 번들 ID처럼 영구적일 필요는 없지만, 주소를 바꾸면 App Store Connect와 앱을 함께 바꿔야 함.
- [x] **C4 [엔지니어]** 설정 › 정보에 "개인정보 처리방침", "도움말 · 문의" 행과 "버전 1.0.0" 표시(2026-11-14). 웹은 새 창으로 페이지를, iOS 앱은 앱 안 화면으로 엶. e2e: `platform-web.spec.ts`, `native-shell.spec.ts`.
- [ ] **C5 [엔지니어]** 배포 후 두 URL이 200으로 열리는지, 휴대폰 폭에서 읽히는지 확인. (`vite preview`로 세 경로가 200·HTML인 것과 390px 라이트/다크 화면은 확인함. GitHub Pages에서는 아직.)

## D. 빌드 품질 (엔지니어 + 기기)

- [ ] **D-1** `ios.yml` 통과(첫 Swift 컴파일, 위젯 포함 여부, 매니페스트·데이터 번들 확인 — 10 §2).
- [ ] **D-2** TestFlight 내부 테스트 → 10 §5 기기 체크리스트 전부(비행기 모드 첫 실행, 저장·복원, 알림, 위젯, 발음, 진동, 다크 모드, iPhone SE 폭, **iOS 16.4 기기 또는 시뮬레이터**).
- [ ] **D-3** 업로드 후 App Store Connect 경고 메일 확인: 필수 사유 API 누락(ITMS-91053 계열), 사진 사용 목적 문자열(ITMS-90683), `UIRequiredDeviceCapabilities = armv7`(10 §7). 매니페스트는 `privacy-labels.md` §3에서 코드와 대조해 맞다고 확인했으나 링크 방식은 빌드에서만 확인됨.
- [ ] **D-4** 외부 TestFlight 그룹(베타 심사) 1~2주, 지인 10~20명(06 §6) — 4.2 지적을 미리 들을 기회.
- [ ] **D-5** 단어 ID 개편이 main에 들어간 뒤라면 백업 가져오기(옛 웹 백업 → 앱)를 다시 확인.

## E. 메타데이터 입력 (소유자가 입력·승인, 엔지니어가 준비)

- [ ] **E1** 이름·부제·프로모션 텍스트·설명·키워드·새로운 기능·저작권 — `listing-ko.md`. "8,130단어"와 위젯 문장은 제출 직전에 다시 확인.
- [ ] **E2** 카테고리: 교육 / 참고. 연령 등급 설문 — `listing-ko.md` §8 (예상 4+).
- [ ] **E3** 앱 개인정보 보호: "데이터를 수집하지 않음" — `privacy-labels.md` §1. 1.0에 오류 추적·분석을 넣었다면 다시 답할 것.
- [ ] **E4** 스크린샷: 6.9"(1320×2868)와 6.3"(1206×2622) 각 6장 — `screenshots.md`. 가능하면 실제 기기·시뮬레이터 캡처로 교체, 캡션 합성.
- [ ] **E5** App Review 정보: 로그인 필요 없음, 연락처(이름·전화·이메일), 메모 — `review-notes.md` §1(3,319바이트, 한도 4,000바이트).
- [ ] **E6** 수출 규정: `ITSAppUsesNonExemptEncryption = NO`가 Info.plist에 있으므로 빌드마다 묻지 않아야 함. 물으면 "면제".
- [ ] **E7** 가격: 무료, 사용 가능 국가: 대한민국. 콘텐츠 권리: 제3자 콘텐츠 사용 권리 있음(`listing-ko.md` §10).
- [ ] **E8 [소유자]** 출시 방식: "수동 출시"(승인 후 직접 출시 버튼) 추천 — 처리방침·지원 페이지와 웹 공지를 맞춰 낼 수 있음.

## F. 제출과 그 뒤

- [ ] **F1 [소유자]** 심사에 제출. Apple 안내: 제출의 50% 이상을 24시간 안에, 90%를 48시간 안에 심사(06 §6, 2026-11-13 확인). 연말 제출 중단 기간이 있을 수 있으니 12월 중순 전 제출 목표(06 §7.1).
- [ ] **F2** 리젝되면 `review-notes.md` §2의 해당 답변을 고쳐서 Resolution Center에 답하고, 바꾼 것을 구체적으로 적음.
- [ ] **F3 [소유자]** 승인 → 출시 → 웹 버전에 "iPhone 앱" 안내(06 E5).

## G. 루마 플러스(1.1 이후)를 위해 미리 막혀 있는 것

| 막힌 일 | 무엇을 기다리나 |
| --- | --- |
| 유료 앱 계약·인앱 상품 등록 | 사업자등록(BRN)과 한국 세금 양식 — 한국 거주 개인은 BRN이 필요한 것으로 보임(06 §3.2, 미확인), 소규모 사업자 프로그램 신청 |
| RevenueCat 연동·페이월 | 계약 완료, RevenueCat 계정, 앱 쪽 구현(`server/README.md` §12-3: 아직 없음) |
| 서버 배포 | Cloudflare 계정·도메인, Anthropic 조직 계정과 지출 한도(`server/README.md` §7) |
| 처리방침 2부 게시, 앱 개인정보 라벨 변경 | 위 구현이 끝나 실제 동작을 확인한 뒤(`privacy-policy-ko.md` 2부, `privacy-labels.md` §2) |
| 이야기 무료 체험 | App Attest 구현 전에는 열지 않음(`server/README.md` §4) |
| 단어 설명(플러스 콘텐츠) | 사전 생성·검수(01 결정 4), 비공개 저장 위치 |
