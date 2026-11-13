# 07. 보안 · 운영안

작성일: 2026-11-13 · 범위: 현재 정적 PWA의 보안 점검(코드 직접 확인), 유료 제품용 백엔드 구조, 운영 체계.
가격·AI 원가는 [`01-business-model.md`](01-business-model.md), 스토어 절차·개인정보 라벨 제출은 [`06-app-store.md`](06-app-store.md)를 따릅니다.

## 결론과 추천 (먼저 읽을 것)

1. **지금 앱에 원격으로 뚫리는 XSS는 없습니다.** `dangerouslySetInnerHTML`·`innerHTML`·`eval`이 코드에 없고, AI 응답과 백업 파일은 모두 React 텍스트 노드로만 화면에 들어갑니다. 가장 큰 위험은 **보안보다 데이터 유실과 API 키 구조**입니다.
2. **가장 심각한 문제 3가지**
   - (높음) 사용자의 Anthropic API 키가 `localStorage`에 평문으로 있고, 저장 위치가 `songch9511.github.io` **출처 전체**라서 같은 계정의 다른 GitHub Pages 저장소 페이지가 그 키를 읽을 수 있습니다. 스토어 제품에서는 이 구조를 없애야 합니다.
   - (중간) 백업 가져오기가 사실상 검증이 없어서, 망가진 파일 하나로 앱이 **매번 흰 화면으로 죽는 상태가 저장**됩니다. 사용자가 복구할 UI가 없습니다.
   - (중간) 학습 기록이 한 브라우저의 `localStorage`에만 있고, AI 설명 캐시와 같은 저장 한도(약 5MB)를 나눠 씁니다. 한도가 차면 **진도 저장이 조용히 실패**합니다. 단어 ID도 데이터 파일의 순서에 묶여 있어서 데이터를 다시 만들면 진도가 엉뚱한 단어에 붙습니다.
3. **백엔드는 Cloudflare Workers + D1 + KV를 추천합니다.** 앱과 같은 TypeScript, 무료로 시작해 유료 플랜 월 $5 수준, 무료 플랜의 일일 한도가 그대로 비용 상한 역할을 합니다. 인증은 처음엔 **계정 없이 App Store 거래로 사용자를 식별**하고, 동기화를 만들 때 **Sign in with Apple 하나만** 붙입니다.
4. **AI 비용의 대부분은 없앨 수 있습니다.** 단어 설명은 단어 8,130개로 끝이 정해진 콘텐츠이므로 Batch API로 **한 번 미리 만들어 정적 데이터로 배포**하고, 실시간 모델 호출은 "약한 단어 이야기"만 남깁니다. 프록시는 자유 입력 프롬프트를 받지 않고 **단어 ID만** 받습니다.
5. **이번 주 할 일 1~3순위**: ① 백업 가져오기를 zod 스키마로 검증하고 오류 화면(ErrorBoundary)에 복구 버튼 추가, ② 저장 실패를 사용자에게 알리고 AI 캐시를 IndexedDB로 옮기며 `navigator.storage.persist()` 요청, ③ main 브랜치 보호·워크플로 권한 축소·액션 SHA 고정·Dependabot 켜기. (전체 순서는 9절)

---

## A. 현재 앱 보안 점검

점검 방법: `src/` 전체, `vite.config.ts`, `index.html`, `package.json`, 워크플로, `scripts/`를 읽고, 빌드 산출물(`sw.js`, `index.html`)을 scratch 디렉터리에 빌드해 확인, `npm audit` 실행, GitHub API로 브랜치 보호 조회.

### A-1. 직접 확인한 사실 (문제 없음)

| 항목 | 확인 결과 |
| --- | --- |
| 백업 내보내기에 키 포함 여부 | `Settings.tsx`의 `exportData`가 `apiKey: ''`로 비우고 내보냄. 가져오기도 현재 키를 유지. **키는 백업 파일에 들어가지 않음.** |
| 서비스 워커 캐시 | `sw.js`는 빌드 산출물(js/css/html/svg/png/json 24개)만 precache. `runtimeCaching` 설정 없음 → **API 요청·응답은 캐시되지 않음.** |
| 오류 메시지 | `ai-client.ts`는 상태 코드만 문구에 넣음. 키나 응답 본문을 화면·콘솔에 쓰지 않음. |
| 외부 스크립트 | 빌드된 `index.html`은 자체 번들, `registerSW.js`, 매니페스트만 불러옴. 웹폰트·분석 도구·CDN 없음(폰트는 시스템 폰트). |
| DOM 주입 지점 | `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` 없음. `href`는 모두 상수(`#/settings` 등). `style` 값은 모두 계산된 숫자. |
| 저장소 비밀 노출 | `git log -S "sk-ant"` 결과는 입력창 placeholder뿐. 실제 키 커밋 없음. |

**AI 응답·백업 파일로 할 수 있는 일**: 스크립트 실행은 불가(React가 텍스트로 이스케이프). 할 수 있는 것은 이상한 문장 표시, 앱 죽이기(A-2 #2), 상태 객체의 prototype 바꾸기 정도입니다. 마지막 것은 Node로 재현해 봤고(`__proto__` 키가 `replaceState`의 `Object.assign`에서 setter로 동작), 전역 `Object.prototype`은 오염되지 않아 영향은 미미합니다.

### A-2. 발견 사항과 수정안

심각도: 높음 = 키·데이터가 남에게 넘어갈 수 있음 / 중간 = 데이터 유실·서비스 중단 / 낮음 = 방어 심층화.

| # | 심각도 | 발견 | 근거(코드) | 수정안 | 시점 |
| --- | --- | --- | --- | --- | --- |
| 1 | **높음** | API 키를 `localStorage`(`kasane.state.v2` 안의 `settings.apiKey`)에 평문 저장. 저장 출처는 `https://songch9511.github.io`로, **같은 계정의 모든 Pages 저장소가 같은 출처**. 다른 저장소 페이지의 스크립트, 악성 확장, 향후 XSS 하나로 키 유출. 키는 조직 전체 권한의 API 키. | `store.ts`, `ai-client.ts` (`dangerouslyAllowBrowser: true`) | 지금: ① 설정 문구에 "전용 workspace 키를 만들고 월 지출 한도를 걸어 쓰세요" 안내, ② "이 기기에 기억" 끄면 `sessionStorage`에만 두는 선택지, ③ 아래 #7의 CSP로 `connect-src`를 `api.anthropic.com`으로 묶기. 근본: 사용자 지정 도메인으로 이전(같은 출처 공유 해소) + **스토어 제품에서는 키 입력 기능 제거, 프록시로 대체**(B절). | 지금 + 백엔드 |
| 2 | 중간 | 백업 가져오기 검증이 `v === 2`, `cards`, `settings` 존재 여부뿐. 예: `settings.target: 9` 또는 카드 ID `"9-0"` → `breakdowns()`에서 `undefined` 접근 → Home 렌더 중 TypeError. 상태는 렌더 전에 저장되므로 **다시 열어도 계속 흰 화면**. ErrorBoundary 없음. `marks`가 배열이 아니거나 `log: null`이어도 같음. | `Settings.tsx importData`, `store.ts replaceState`, `srs.ts breakdowns` | 이미 의존성에 있는 **zod로 백업 스키마 정의**(급수 1~5, `dailyNew` 1~100, 카드 ID 정규식 `^[1-5]-\d+$`와 범위, 숫자 필드 유한값, 알 수 없는 키 제거). 교체 전 현재 상태를 `kasane.state.prev`로 보관. 최상위 ErrorBoundary에 "직전 상태로 되돌리기 / 백업 내보내기 / 초기화" 버튼. `load()`에도 같은 스키마 적용. | 지금 |
| 3 | 중간 | AI 설명 캐시(`kasane.ai.<id>`, 단어당 대략 1~2KB 추정)가 학습 상태와 **같은 localStorage 한도**를 씀. 한도 초과 시 `update()`의 `setItem` 실패를 `catch`로 삼키고 메모리에서만 계속 → **앱을 닫으면 그날 진도 소실, 사용자는 모름**. `resetAll`도 AI 캐시는 지우지 않음. | `ai.ts explainWord`, `store.ts update` | AI 캐시를 IndexedDB(또는 Cache API)로 이전하고 개수 상한(LRU). 상태 저장 실패 시 화면 상단에 "저장 공간이 부족해요 — 백업하세요" 표시. 캐시 읽기도 zod로 검증(`cachedExplain`은 지금 무검증). | 지금 |
| 4 | 중간 | 단어 ID가 `"<급수>-<배열 순번>"`이고 순번은 원본 CSV를 중복 제거 후 시드 셔플한 결과. 원본 CSV가 한 줄만 바뀌어도 **기존 진도가 다른 단어로 옮겨 붙음**. | `scripts/build-data.mjs`, `data.ts wordId` | 지금 ID 매핑을 동결(현재 `public/data`를 기준 스냅샷으로 커밋 유지)하고, 데이터 재생성 스크립트가 기존 ID 순서를 깨면 실패하도록 검사 추가. 장기적으로 내용 기반 ID(예: `표기|읽기` 해시)와 이전 표를 둠. 계정 이전(8절) 전에 반드시 정리. | 지금 |
| 5 | 중간 | 서비스 워커가 `skipWaiting` + `clientsClaim`(autoUpdate)로 즉시 교체. 열려 있던 탭은 옛 JS를 쓰는데, 지연 로딩 청크(`ai-client-*.js`, `sdk-*.js`)는 새 배포에서 사라짐 → **배포 직후 AI 버튼이 "알 수 없는 오류"**. | 빌드된 `sw.js`, `ai.ts`의 `import('./ai-client')` | 동적 import 실패를 잡아 "새 버전이 있어요, 새로고침" 안내 후 `location.reload()`. 또는 `registerType: 'prompt'`로 바꿔 사용자가 갱신 시점을 고르게. | 지금 |
| 6 | 중간 | CI/CD: ① `permissions`가 워크플로 최상위라 **`npm ci`(서드파티 설치 스크립트 실행)가 도는 build 잡도 `pages: write`, `id-token: write`를 가짐**, ② 액션이 태그(`@v4`)로만 고정, ③ **main 브랜치 보호 없음·ruleset 없음**(GitHub API 확인: "Branch not protected", rulesets `[]`), ④ Dependabot 설정 없음. 트리거는 `push: main`과 수동뿐이라 **외부 PR이 이 워크플로를 실행하거나 배포할 수는 없음**(좋음). | `.github/workflows/deploy.yml` | 권한을 잡 단위로: build는 `contents: read`만, deploy만 `pages: write`+`id-token: write`. 액션을 커밋 SHA로 고정하고 Dependabot(`github-actions`, `npm` 주 1회)으로 갱신. main에 ruleset: PR 필수, 상태 검사(빌드·테스트) 통과 필수, force push·삭제 금지. 계정 2FA, secret scanning·push protection(공개 저장소 무료) 켜기. `github-pages` environment가 main만 배포하도록 되어 있는지 설정 화면에서 확인(이 세션에서는 API가 막혀 **미확인**). | 지금 |
| 7 | 낮음 | CSP·Referrer 정책 없음. GitHub Pages는 응답 헤더를 바꿀 수 없음. | `index.html` | 빌드 때만 meta CSP 주입(Vite `transformIndexHtml`, 개발 서버는 인라인 스타일을 쓰므로 제외): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.anthropic.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'` + `<meta name="referrer" content="no-referrer">`. React의 `style` prop은 CSSOM으로 들어가 `style-src`에 막히지 않지만 **배포 전 실제 브라우저로 확인** 필요. meta CSP는 `frame-ancestors`를 지원하지 않아 클릭재킹 방어는 불가 → 위험은 낮음(파괴적 동작은 `confirm()`을 거침). 헤더 기반 CSP는 호스팅 이전 후(7절). | 지금 |
| 8 | 낮음 | `npm audit`: 6건(낮음 2, 중간 4) — `deepmerge`, `glob`, `minimatch` 등 **전부 `vite-plugin-pwa` → `workbox-build` 빌드 도구 체인**. `npm audit --omit=dev`는 0건. 빌드 입력은 우리 파일뿐이라 실제 도달 경로 없음. `npm audit fix --force`는 `vite-plugin-pwa`를 1.1.0으로 **내리는** 파괴적 변경이라 하지 말 것. | `npm audit` (2026-11-13, 작업 트리 기준) | 상위 패키지 갱신을 기다리고 Dependabot으로 추적. CI에 `npm audit --omit=dev --audit-level=high` 게이트. | 지금 |
| 9 | 낮음 | AI 모델이 `claude-opus-5-5`, `max_tokens: 4000`, 클라이언트 측 호출 제한 없음("다른 이야기 만들기" 무제한). 지금은 사용자 자기 돈이라 보안 문제는 아니나, 프록시로 옮기면 그대로 비용 공격 지점. | `ai-client.ts` | B-5의 할당량·상한 적용. 모델 선택은 01 문서의 원가 계산을 따름. | 백엔드 |

### A-3. 프롬프트 인젝션과 남용

**지금**: 프롬프트에 들어가는 값은 단어 표기·읽기·뜻(정적 `public/data/*.json`)뿐이고, "약한 단어"도 카드 ID를 정적 데이터에 대응시켜 만듭니다. 사용자가 자유 문장을 넣을 경로가 없고, 백업으로 넣은 가짜 카드 ID는 `wordsById`에서 걸러집니다. 오염 가능한 입력은 저장소의 한국어 뜻 파일(모델 번역, 저장소 쓰기 권한이 필요)뿐입니다. 출력은 zod 스키마로 파싱하고 텍스트로만 그리므로, 조작된 응답이 할 수 있는 최대치는 틀린/부적절한 문장 표시입니다.

**프록시 이후 원칙**
- 클라이언트는 **프롬프트를 보내지 않고 `wordId`만** 보냅니다. 서버가 자기 데이터로 프롬프트를 조립합니다. 시스템 프롬프트·모델·`max_tokens`는 서버 고정.
- **공유 캐시에는 서버가 만든 입력에서 나온 결과만** 넣습니다. 나중에 "질문하기" 같은 자유 입력 기능을 만들면 그 결과는 사용자 개인 응답으로만 돌려주고 공유 캐시·다른 사용자에게 절대 섞지 않습니다(한 사람의 인젝션이 모두에게 퍼지는 것을 막음).
- 출력은 서버에서 스키마 검증 후 저장, 길이 상한, Markdown/HTML 렌더링 금지 유지.
- 비용 남용: 사용자별 일·월 할당량, 전체 일일 지출 상한(초과 시 AI만 끄고 앱은 계속), Anthropic 쪽 workspace 지출 한도를 마지막 안전판으로(B-5).

---

## B. 유료 제품의 목표 구조

### B-4. 최소 백엔드: Cloudflare Workers + D1 + KV

**비교** (확인일 2026-11-13. 이 세션에서는 공식 가격 페이지에 직접 접속이 막혀 검색 결과 요약으로 확인 — 계약 전 공식 페이지 재확인 필요)

| | Cloudflare Workers + D1/KV | Supabase | Firebase |
| --- | --- | --- | --- |
| 무료 범위 | Workers 하루 10만 요청(초과 시 Error 1027), D1 저장 5GB·하루 읽기 500만 행·쓰기 10만 행, KV 하루 읽기 10만·쓰기 1천 | DB 500MB, MAU 5만, egress 5GB, **7일 무활동 시 프로젝트 일시정지** | Firestore 하루 읽기 5만·쓰기 2만, **Cloud Functions는 Blaze(종량제) 필요** |
| 유료 시작 | 월 $5(Workers Paid, 월 1천만 요청 포함 — 공식 페이지 미확인) | Pro 월 $25(MAU 10만, DB 8GB) | Blaze 종량제, 하드 상한 없음 |
| 인증 | 직접 구현(Apple ID 토큰 JWT 검증, 라이브러리로 100줄 안팎) | 내장(Apple 로그인 지원) | 내장 |
| 맞는 점 | 앱과 같은 TS, 한국과 가까운 엣지, 무료 한도가 곧 비용 상한 | SQL+인증 한 번에 | 모바일 SDK 풍부 |
| 안 맞는 점 | 인증·마이그레이션 직접 | 무료 플랜 정지, 고정비 $25 | 종량제 비용 폭주 위험, 문서형 DB 과금 단위 |

**추천: Cloudflare.** 필요한 서버 기능이 "검증하고, 세고, 중계하고, 캐시하는 것"뿐이라 서버리스 함수 하나로 충분하고, 1인 개발자에게 가장 큰 위험인 **예상 못 한 청구서**를 무료 한도·고정 $5로 막을 수 있습니다. 인증은 처음엔 계정이 없으므로(아래) 내장 인증의 장점이 작습니다. 웹 버전 호스팅도 Cloudflare Pages로 옮기면 사용자 지정 도메인·응답 헤더(CSP, `frame-ancestors`)·브랜치별 미리보기가 한 번에 해결됩니다(A-2 #1, #7).

출처: [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/), [Workers 한도](https://developers.cloudflare.com/workers/platform/limits), [D1 가격](https://developers.cloudflare.com/d1/platform/pricing/), [KV 한도](https://developers.cloudflare.com/kv/platform/limits), [Supabase 요금 정리(Toolradar)](https://toolradar.com/tools/supabase/pricing), [Supabase 과금 문서](https://Supabase.io/docs/guides/platform/org-based-billing), [Firebase 요금 정리(Activepieces)](https://www.activepieces.com/blog/firebase-pricing-2026-plans-costs-and-free-limits.md).

**구조도**

```
[iOS 앱(StoreKit 2) / 웹 PWA]
   │  학습 기록은 기기 안(IndexedDB) ── 동기화는 3단계·선택
   │  HTTPS, Bearer 세션 토큰
   ▼
[Cloudflare Worker  api.<도메인>/v1]
   ├─ 세션 발급: Apple 서명 거래(JWS) 검증 / (3단계) Apple ID 토큰 검증
   ├─ 권한 확인: D1 entitlements
   ├─ 할당량: D1 usage + Rate Limiting
   ├─ AI: KV 캐시 → (없으면) Anthropic API ── 전용 workspace 키, 지출 한도
   └─ 웹훅: App Store Server Notifications V2 ← Apple
[D1] users · entitlements · usage · sync(3단계)    [KV] 공유 AI 캐시
[정적 데이터] 미리 생성한 단어 설명 JSON(앱 번들/Pages에 포함)
```

**단계별 범위**
- **1단계(백엔드 전, 지금)**: 단어 설명 8,130개를 Batch API(50% 할인)로 한 번 생성 → 검수 가능한 정적 JSON으로 배포. 실시간 AI 호출 수가 거의 0이 됩니다. 비용은 모델·길이에 따라 수십~백여 달러 1회(추정, 01 문서에서 확정).
- **2단계(AI 프록시 + 구매 확인, 계정 없음)**: 앱이 StoreKit 2로 받은 서명 거래를 보내면 서버가 Apple 루트 인증서 체인으로 JWS를 검증하고 `originalTransactionId`를 사용자 키로 씁니다. 구매 시 `appAccountToken`(앱이 만든 UUID)을 넣어 설치와 거래를 연결합니다. 이메일·이름을 받지 않습니다. 무료 사용자는 설치 ID(앱이 만든 무작위 UUID) + iOS App Attest로 할당량만 관리(App Attest 적용 여부는 06 문서와 함께 확정).
- **3단계(계정·동기화, 선택)**: Sign in with Apple로 계정 생성, 기기 간 동기화, 계정 삭제.

**엔드포인트 (`/v1`, 버전 고정, 하위 호환 유지)**

| 메서드·경로 | 용도 | 비고 |
| --- | --- | --- |
| `POST /v1/session` | 설치 ID + (있으면) 서명 거래 또는 Apple ID 토큰 → 짧은 세션 토큰(JWT 15분) + 갱신 토큰 | 갱신 토큰은 D1에 해시로 저장 |
| `GET /v1/entitlement` | 구독 상태·만료일·남은 AI 할당량 | |
| `POST /v1/ai/story` | `{ wordIds: string[≤12] }` → 이야기 | 유료 전용, 할당량 차감, 정렬한 ID 집합 해시로 캐시 |
| `POST /v1/ai/explain` | `{ wordId, promptVersion }` | 정적 데이터에 없는 경우만(재생성·신규 단어). KV 캐시 우선 |
| `POST /v1/apple/notifications` | App Store Server Notifications V2 | 서명 검증, `REFUND`·`EXPIRED`·`DID_RENEW` 반영, 멱등 처리(`notificationUUID`) |
| `GET/PUT /v1/sync` | 카드·로그 변경분 업로드/다운로드 | 3단계 |
| `DELETE /v1/account` | 계정·동기화 데이터 삭제 + Apple 토큰 철회 | 3단계, 앱 안에서 호출 |
| `GET /v1/status` | 최소 지원 버전, 공지, AI 일시 중단 여부 | 장애 안내·강제 업데이트용 |

Apple 연동 참고: [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi), [App Store Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications). 상세 결제 설계는 01 문서.

**저장하는 데이터**: `users(id, apple_sub_hash?, install_id_hash, created_at)`, `entitlements(user_id, original_transaction_id, product_id, status, expires_at, environment)`, `usage(user_id, day, story_calls, input_tokens, output_tokens)`, `ai_cache(key, json, prompt_version, created_at)` — 공용 콘텐츠라 개인정보 아님, `sync(user_id, card_id, card_json, updated_at)` (3단계).
**기기를 떠나지 않는 것**: 학습 기록·답변 이력·북마크·시험일·목표 급수(3단계에서 사용자가 동기화를 켜기 전까지), 이메일·이름(받지 않음). AI 요청에는 단어 ID만 가고, Anthropic에는 사용자 식별자를 보내지 않습니다(남용 추적이 필요하면 불투명 해시만 `metadata.user_id`로).

### B-5. 백엔드 통제

- **인증**: 2단계는 계정 없이 "구매 = 신원". 3단계는 **Sign in with Apple 하나만**. 지침 4.8은 제3자·소셜 로그인을 쓸 때 개인정보 보호 기능을 갖춘 동등한 로그인 옵션(대표적으로 Sign in with Apple)을 함께 요구합니다. Apple 하나만 쓰면 이 조건을 자연히 충족하고 Google 등을 추가할 때만 재검토하면 됩니다(4.8의 예외 조항·정확한 문구는 원문 **미확인** — [가이드라인 원문](https://developer.apple.com/app-store/review/guidelines/#login-services)에서 확인 필요). 계정을 만들면 **앱 안 계정 삭제(5.1.1(v)) + Sign in with Apple REST API로 토큰 철회**가 필수입니다([Apple 계정 삭제 안내](https://developer.apple.com/support/offering-account-deletion-in-your-app), 확인 2026-11-13).
- **AI 호출 허가**: 세션 토큰 검증 → 권한 확인 → 할당량 확인 → 캐시 → 모델 순. 권장 초기값(01 문서 가격에 맞춰 조정): 유료 이야기 하루 5회·월 60회, 무료 0회(미리 만든 설명은 무료로 열람 가능 여부는 01 결정). 같은 단어 묶음 요청은 캐시 응답. Workers Rate Limiting으로 IP·토큰당 분당 요청 상한.
- **비용 상한과 알림**: ① Anthropic 전용 workspace + 월 지출 한도(최후 방어선), ② D1에서 일일 토큰 합계를 계산해 상한(예: 하루 $5) 초과 시 `/v1/status`의 AI 중단 플래그 자동 켜기, ③ 매시 cron Worker가 일일 지출이 상한의 50%·80%를 넘으면 메일/메신저 알림, ④ Cloudflare 사용량 알림.
- **비밀 관리**: Anthropic 키, Apple In-App Purchase 키(.p8), 세션 서명 키는 `wrangler secret`에만. 저장소·클라이언트·로그에 없음. 키별 담당 용도 1개, 분기마다 교체, 교체 절차를 런북에 기록. 스테이징·프로덕션 키 분리(Apple 샌드박스/프로덕션 환경도 분리).
- **로그**: 경로, 상태 코드, 지연, 토큰 수, 불투명 사용자 해시만. **요청·응답 본문(단어 목록, 이야기)은 기록하지 않음.** IP는 남용 대응에 필요한 기간(예: 7일)만, 그 뒤 삭제. 보관 기간을 처리방침에 적음.

### B-6. 개인정보와 법적 의무 (한국 개인정보 보호법 기준)

**단계별 수집 항목**

| 단계 | 개발자가 처리하는 개인정보 | 국외 이전 |
| --- | --- | --- |
| 지금 | 없음(모든 데이터가 기기 안, AI는 사용자 키로 사용자→Anthropic 직접) | 없음(사용자 본인이 직접 전송) |
| 1단계 | 없음(정적 콘텐츠만). 단 스토어 등록 시 개인정보 처리방침 URL은 필요(06 문서) | 없음 |
| 2단계 | 설치 ID, 거래 ID, 이용량, 접속 IP·로그 | Cloudflare(미국), Anthropic(미국: 단어 ID로 만든 프롬프트만, 개인 식별자 없음) |
| 3단계 | Apple 사용자 식별자, (요청 시) 릴레이 이메일, 학습 기록 | 위 + D1 저장 위치 |

**적용될 의무** (확인일 2026-11-13. ⚠ 표시는 전문가 확인 필요)
- **처리방침 공개(법 제30조)**: 수집 항목·목적·보유기간·파기 절차, 처리 위탁(Cloudflare, Anthropic), 국외 이전 사항, 정보주체 권리 행사 방법, 개인정보 보호책임자 연락처. 개인 개발자는 본인이 보호책임자가 되는 구조로 보임 ⚠.
- **국외 이전(법 제28조의8)**: 2023년 개정으로 정보통신서비스 특례가 일원화되었고, 계약 이행에 필요한 처리 위탁·보관이면서 처리방침에 공개한 경우 별도 동의 없이 이전할 수 있는 근거가 생겼습니다. 이전 국가, 시기·방법, 받는 자 이름·연락처, 항목, 목적·보유기간, 거부 방법을 처리방침에 적습니다. 2단계 Anthropic 전송이 개인정보 이전에 해당하는지(식별자 없음)는 ⚠. 출처: [개인정보보호위원회 국외이전 안내](https://pipc.go.kr/np/default/page.do?mCode=D060040000), [법률신문 시행령 개정 해설](https://www.lawtimes.co.kr/news/articleView.html?idxno=189930).
- **유출 통지·신고(법 제34조, 시행령 제40조)**: 유출을 안 때 정보주체에게 통지하고, ① 1천 명 이상, ② 민감·고유식별정보, ③ **외부의 불법 접근(해킹)으로 인한 유출**이면 규모와 관계없이 72시간 내 개인정보보호위원회 또는 KISA에 신고. ③ 때문에 소규모 서비스도 해당됩니다. 2026년 9월 과징금 상향·신고 규정 개정 보도가 있어 현행 조문 ⚠. 출처: [개인정보보호위원회 유출 신고 안내](https://pipc.go.kr/np/default/page.do?mCode=D030040000), [머니투데이 2026-09-10](https://www.mt.co.kr/tech/2026/09/10/2026091008562069877).
- **만 14세 미만(법 제22조의2)**: 동의를 근거로 처리할 때는 법정대리인 동의와 그 확인 의무. JLPT 학습자에 중·고등학생이 있을 수 있으므로 3단계 계정 생성 화면에 "만 14세 이상" 확인을 두고 미만이면 계정 없이(기기 안에서만) 쓰게 하는 방식을 추천. 2단계처럼 동의가 아닌 계약 이행 근거로 처리하는 경우의 적용 범위 ⚠. 출처: [법 제22조의2 해설](https://korea.legal/wiki/%ea%b0%9c%ec%9d%b8%ec%a0%95%eb%b3%b4-%eb%b3%b4%ed%98%b8%eb%b2%95-%ec%a0%9c22%ec%a1%b0%ec%9d%982/).
- **삭제·파기**: 이용 목적 달성 시 지체 없이 파기(법 제21조), 정보주체의 삭제 요구 처리. 앱 안 계정 삭제가 Apple 요건과 이 의무를 함께 충족하도록 설계(D1 행 삭제 + 백업에서는 보관 주기 만료로 소멸, 그 기간을 처리방침에 명시).
- **안전성 확보조치**: 접근 권한 최소화(Cloudflare 계정 2FA, 키 분리), 인증 정보 암호화(갱신 토큰 해시), 접속 기록 보관 ⚠(보관 기간 기준).
- **Apple 개인정보 라벨**: 2단계는 "구매 내역(거래 ID)", "식별자(기기 ID)", "사용 데이터"가 앱 기능 목적·사용자에 연결됨, 추적 없음. 3단계에 "사용자 ID", "기타 사용자 콘텐츠(학습 기록)" 추가. 제출 절차는 06 문서.
- **통신판매업 신고 등 판매 관련 의무**: 01·06 문서 범위, ⚠.

### B-7. 운영

**모니터링·오류 추적** (개인정보를 덜 모으는 순)
- 서버: Workers 기본 로그·지표(무료). 5xx 비율과 AI 지출 알림만 우선.
- 클라이언트: **Sentry Developer(무료, 월 오류 약 5천 건, 1인)** + `sendDefaultPii: false`, `beforeSend`에서 메시지·URL 해시의 단어/학습 데이터 제거, 세션 리플레이·브레드크럼 텍스트 끔. 대안은 Worker에 `/v1/client-error`를 두고 오류 이름·스택·버전만 D1에 저장(무료, 외부 이전 없음). 가격 출처: [Sentry 요금 정리(Last9)](https://last9.io/blog/sentry-pricing/) — 공식 페이지 미확인.
- 사용 분석은 결제 시작 전까지 도입하지 않음(개인정보 라벨과 처리방침이 커짐). 필요하면 서버 측 집계(일별 활성 설치 수)만.

**가동 감시와 장애 대응(1인 기준)**
- 외부 가동 감시(무료 플랜이 있는 서비스, 5분 간격)로 `/v1/status`와 웹 첫 화면 확인 → 휴대폰 알림.
- 런북 한 장: ① AI 중단 플래그 켜기(앱은 AI 없이 정상 동작해야 함 — 지금 구조가 이미 그렇게 됨), ② `wrangler rollback`으로 직전 Worker 버전, ③ 키 유출 의심 시 Anthropic·Apple 키 폐기→재발급→`wrangler secret put`, ④ 개인정보 유출이면 72시간 신고 판단(B-6), ⑤ 사후 기록.
- 목표: 학습 기능은 서버 없이 돌아가므로 서버 장애 = AI·동기화만 멈춤. 응답 목표 24시간, 휴가 때는 AI 일일 상한을 낮춰 둠.

**백업과 복구**
- D1: Time Travel(시점 복구)을 기본으로 쓰고 보존 기간은 플랜 따라 다름(**미확인**, 공식 문서 확인), 추가로 주 1회 `wrangler d1 export`를 암호화해 별도 저장소(R2 또는 개인 저장소)에 4주 보관. **분기마다 스테이징에 복구 연습.**
- 사용자 기기 데이터: 8절의 백업 알림·내보내기.

**릴리스 절차**
- 버전: `package.json` semver를 빌드에 주입해 설정 화면 하단과 오류 보고에 표시, git 태그 `v0.x.y`.
- 웹: PR → 미리보기 배포(Cloudflare Pages 이전 시 자동) → main 병합 → 프로덕션. 롤백은 직전 배포로 되돌리기(Pages는 클릭 한 번, GitHub Pages는 revert 커밋).
- **PWA 서비스 워커 사고 복구**: 브라우저는 페이지를 열 때 `sw.js`를 따로 다시 확인하므로, 앱 JS가 망가져도 고친 버전을 배포하면 다음 실행 때 교체됩니다. 서비스 워커 자체가 망가졌다면 스스로 등록을 해제하고 캐시를 지우는 "kill switch" `sw.js`를 배포. 이 파일을 미리 `scripts/`에 준비해 두고, `sw.js` 파일명·경로는 절대 바꾸지 않습니다.
- 스토어: TestFlight(스테이징 서버 연결) → 단계적 출시(7일에 걸쳐 확대, 문제 시 일시정지) → 바이너리는 되돌릴 수 없으므로 수정본은 신속 심사 요청. 서버 API는 구버전 앱이 쓰는 동안 하위 호환 유지, `/v1/status`의 최소 지원 버전으로 강제 업데이트 안내. 앱 안에 웹 자산을 넣는 경우 웹 수정이 스토어 앱에 바로 반영되지 않는 점은 06 문서 참조.
- Worker: `wrangler deploy --env staging` → 스모크 테스트 → 프로덕션, 데이터베이스 마이그레이션은 앞뒤 호환되는 것만(열 추가 먼저, 삭제는 다음 릴리스).

**의존성 갱신 루틴**: Dependabot 주 1회(그룹화), 월 1회 `npm outdated`와 lockfile 차이 검토, CI에 `npm audit --omit=dev --audit-level=high`. `@anthropic-ai/sdk`는 백엔드로 옮기면 클라이언트 번들에서 제거(현재 지연 로딩 청크 약 380KB + 88KB).

**지원·환불·불만**
- 앱 안 "문의하기": 메일 링크에 앱 버전·OS만 자동 첨부, 학습 데이터는 사용자가 원할 때만 백업 파일로 첨부. 별도 지원 메일 주소 사용. 답변 목표 영업일 2일.
- 환불은 **Apple이 처리**(개발자가 직접 환불 불가) → [reportaproblem.apple.com](https://reportaproblem.apple.com) 안내 문구 준비. `REFUND` 알림을 받으면 권한 회수. 반복 환불·악용은 기록만 하고 개별 대응.
- 자주 묻는 질문: 기기 변경 시 진도 옮기기, 구독 복원, AI 한도.

**월 비용 표** (MAU = 월 활성 사용자. 인프라는 위 가격 기준, AI는 가정값 — 실제 단가·전환율은 01 문서 우선)

가정: DAU = MAU의 30%, 사용자당 하루 API 요청 20회 이하, 유료 전환 5%, 유료 사용자 월 이야기 20회, 이야기 1회 ≈ 입력 600 + 출력 1,500 토큰(Opus 5.5 $4/$20 per MTok 기준 약 $0.032, Sonnet 5.5 $2/$10이면 약 $0.016).

| 항목 | 100 MAU | 1,000 MAU | 10,000 MAU |
| --- | --- | --- | --- |
| Workers/D1/KV | $0 (무료) | $5 (무료 한도 내지만 Error 1027 위험 때문에 유료 권장) | $5 (요청 약 180만/월, 포함량 내) |
| 웹 호스팅 | $0 | $0 | $0 |
| 도메인 | 약 $1 (연 $10~15, 추정) | 약 $1 | 약 $1 |
| 오류 추적 | $0 | $0 | $0~29 (오류 5천 건 초과 시) |
| Apple Developer Program | 연 $99 → 월 약 $8 (06 문서) | 약 $8 | 약 $8 |
| AI 이야기(Opus 5.5) | 약 $3 | 약 $32 | 약 $320 |
| AI 단어 설명 | 1회성 사전 생성 비용만(1단계) | 0 | 0 |
| **합계(월)** | **약 $12** | **약 $46** | **약 $340~370** |

AI가 비용의 대부분이므로 01 문서에서 이야기 기능의 모델·할당량·가격을 함께 정해야 합니다. 일일 지출 상한이 이 표의 상한을 강제합니다.

### B-8. 백엔드 전, 사용자 데이터 지키기

1. **영구 저장 요청**: 첫 학습 완료 시 `navigator.storage.persist()` 호출. WebKit은 Safari 17부터 Storage API를 지원하고 홈 화면 웹앱 여부 등으로 허용을 판단한다고 밝혔습니다([WebKit 블로그](https://webkit.org/?p=14403)). Safari 탭에서 쓰면 사용자 상호작용 없는 기간이 지나면 스크립트 저장소가 지워질 수 있으므로(7일 정책, [관련 보도](https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833)) **홈 화면에 추가하라는 안내**를 온보딩에 넣습니다. iOS 실기기에서 `persist()` 결과 확인 필요(미확인).
2. **백업 알림**: 마지막 백업 시각을 저장하고, 학습한 날 기준 7일 또는 답변 500장마다 홈에 "백업해 두세요" 카드(닫기 가능). 설정에 마지막 백업 날짜 표시.
3. **내보내기 형식 버전**: `{ format: "jlpt-luma-backup", formatVersion: 1, appVersion, exportedAt, state, aiCache? }`. 가져오기는 형식 버전별 변환 함수를 거친 뒤 zod 검증(A-2 #2). 기존 v2 원본 파일도 계속 읽음.
4. **저장 실패 표시와 저장소 분리**(A-2 #3), **단어 ID 동결**(A-2 #4).
5. **계정 이전 경로(3단계)**: 첫 로그인 때 서버가 비어 있으면 로컬 상태를 그대로 업로드. 양쪽에 데이터가 있으면 카드 수·마지막 학습일을 보여 주고 "이 기기 / 서버" 중 고르게 하며, 고르지 않은 쪽은 백업 파일로 자동 저장. 이후 동기화는 카드 단위 `updated_at` 최신값 우선, 일별 로그는 날짜별 최대값 병합. 장기적으로는 답변 이력을 추가 전용 로그로 남겨 FSRS 매개변수 최적화와 충돌 해결에 씀. 네이티브 앱으로 감쌀 때 저장 위치(WebView localStorage를 그대로 둘지)는 06 문서와 함께 결정.

### B-9. 순서대로 할 일

**이번 주 (백엔드 없이)**
1. 백업 가져오기·`load()`에 zod 스키마 검증, 교체 전 이전 상태 보관, 최상위 ErrorBoundary와 복구 버튼.
2. 상태 저장 실패 알림, AI 캐시를 IndexedDB로 이전·상한, `navigator.storage.persist()`, 홈 화면 추가 안내, 백업 알림 카드.
3. GitHub: main ruleset, 잡별 권한, 액션 SHA 고정, Dependabot, secret scanning·push protection, 2FA 확인.
4. 단어 ID 동결 검사를 `build-data.mjs`에 추가.
5. 동적 import 실패 시 새로고침 안내(배포 직후 AI 오류).
6. 빌드 전용 meta CSP + referrer, API 키 안내 문구(전용 workspace·지출 한도)와 "이 기기에 기억" 선택.
7. 내보내기 형식에 `formatVersion`·`appVersion` 추가.

**백엔드를 만들 때**
8. 사용자 지정 도메인 확보, 웹을 Cloudflare Pages로 이전(헤더 CSP, 미리보기).
9. 단어 설명 사전 생성(Batch) 및 검수, 정적 배포 → 클라이언트에서 SDK·키 입력 제거.
10. Worker: 세션, 거래 JWS 검증, 서버 알림 웹훅, `/v1/ai/story`, 할당량·일일 상한·알림, `/v1/status`.
11. Anthropic 전용 workspace·지출 한도, 비밀은 `wrangler secret`, 스테이징/프로덕션 분리.
12. 로그 정책(본문 미기록, IP 7일), 오류 추적 설정.

**돈을 받기 전에**
13. 개인정보 처리방침(위탁·국외 이전·보유기간·보호책임자) 작성과 전문가 검토, 앱·웹에 링크.
14. 환불·문의 안내, 지원 메일, FAQ.
15. 장애 런북, kill switch `sw.js`, D1 백업·복구 연습 1회.
16. 샌드박스에서 구매·갱신·환불·만료 전 과정 시험(TestFlight).
17. (3단계를 같이 낸다면) Sign in with Apple, 앱 안 계정 삭제와 토큰 철회, 만 14세 확인.

---

## 결정이 필요한 것

1. **웹 버전 호스팅·도메인** — 추천: 사용자 지정 도메인을 사고 Cloudflare Pages로 이전. 같은 출처 공유 문제와 헤더 CSP를 해결하고, 백엔드와 같은 계정에서 관리.
2. **백엔드 스택** — 추천: Cloudflare Workers + D1 + KV. 대안 Supabase(인증 내장, 월 $25 고정비·무료 정지).
3. **단어 설명을 미리 생성할지** — 추천: 예. 8,130개를 1회 생성·검수해 정적 데이터로 배포하고, 실시간 AI는 이야기 기능만. 모델은 01 문서의 품질·원가 비교로 결정.
4. **계정 도입 시점** — 추천: 첫 유료 출시는 계정 없이(구매 = 신원), 동기화 요구가 확인되면 Sign in with Apple 단독으로 추가. 개인정보 수집·계정 삭제 의무를 뒤로 미룸.
5. **지금 웹 앱의 API 키 입력 기능** — 추천: 웹 개인용으로는 유지하되 안내와 "기억하지 않기"를 추가하고, 스토어 빌드에서는 제거.
6. **AI 일일 지출 상한 금액과 사용자별 할당량** — 추천: 시작은 하루 $5, 유료 사용자 이야기 하루 5회·월 60회. 01 문서 가격과 함께 확정.
7. **클라이언트 오류 추적 도구** — 추천: Sentry 무료 플랜(PII 끔). 외부 전송을 피하고 싶으면 자체 `/v1/client-error`.
8. **만 14세 미만 정책** — 추천: 계정 생성은 만 14세 이상만, 미만은 기기 안에서만 사용. 처리방침과 함께 전문가 확인.
9. **개인정보 처리방침·유출 신고 체계의 전문가 검토 여부** — 추천: 결제 시작 전 1회 유료 검토(국외 이전·2026년 개정 사항 포함).
10. **서비스 워커 갱신 방식** — 추천: 지금처럼 자동 갱신을 유지하되 청크 로드 실패 시 새로고침 안내 추가. 학습 중 갑작스런 교체가 문제가 되면 `prompt` 방식으로 전환.
