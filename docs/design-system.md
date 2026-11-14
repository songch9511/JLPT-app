# JLPT 루마 디자인 시스템

작성 2026-11-13 · 가볍게 고침 2026-11-14 · Astryx `@astryxdesign/core` **0.7.15** (베타, 정확한 버전으로 고정) · 테마 `ruma`

이 앱의 모양은 일본 전통색으로 만든 테마 `ruma` 하나에서 나옵니다. 테마는 Meta의 오픈소스 디자인 시스템 [Astryx](https://github.com/meta/astryx)(MIT)의 테마 형식으로 쓰고 Astryx CLI로 빌드하며, 결과는 **평범한 CSS 변수**입니다. 테마가 색·글자·간격·모서리·깊이·움직임의 **유일한 출처**이고, 앱의 CSS(`src/styles.css`)는 같은 토큰만 씁니다.

컴포넌트는 둘로 나뉩니다(9장의 측정으로 정함):
- **직접 만든 가벼운 컨트롤**(`src/components/ui.tsx`): 버튼, 아이콘 버튼, 카드, 세그먼트, 칩, 스위치, 검색칸, 진행 막대, 배지, 배너, 빈 상태, 스켈레톤. 처음 불러오는 묶음에 들어갑니다.
- **Astryx 컴포넌트**(`src/components/overlays.tsx`): 확인 대화상자(`AlertDialog`), 알림 대화상자(`Dialog`), 아래 시트(`BottomSheet`). 사용자가 열 때만 필요해서 **따로 불러오는 묶음**이고, 그 스타일도 함께 옵니다.

## 1. 구조

| 파일 | 내용 |
| --- | --- |
| `src/themes/ruma/rumaTheme.ts` | 테마 원본(`defineTheme`). 팔레트, 토큰, 대화상자 버튼 재정의. **값은 여기서만 바꿉니다.** |
| `src/themes/ruma/icons.ts` | Astryx가 쓰는 아이콘 이름(close …)을 Lucide로 그린 목록(대화상자·시트의 닫기) |
| `src/themes/ruma/ruma.css`, `ruma.js` | `npm run theme`이 만드는 테마 빌드 결과(손으로 고치지 않음, 커밋함) |
| `src/themes/ruma/astryx-tokens.css` | `npm run theme`이 만드는 것: Astryx 기본 토큰 중 앱이 읽고 테마가 정하지 않는 것만(간격 `--spacing-*`, `--radius-full` 등). 처음부터 불러옴 |
| `src/themes/ruma/astryx-overlays.css` | `npm run theme`이 만드는 것: Astryx 전체 CSS(`astryx.css`, gzip 41KB) 중 `overlays.tsx`가 가져오는 컴포넌트의 규칙만(gzip 14KB). 대화상자·시트와 함께 따로 불러옴 |
| `scripts/build-theme.mjs` | `astryx theme build` → `@scope` 펼치기(8장) → 위 두 CSS 만들기 |
| `src/main.tsx` | CSS 순서(reset → astryx-tokens → ruma → styles), 루트(테마 모드, Dynamic Type), 대화상자 묶음 미리 불러오기 |
| `src/themeRoot.ts` | Astryx `<Theme>`가 하던 일 중 필요한 것: `<html data-theme>`(시스템/라이트/다크)와 iOS 글자 크기(Dynamic Type) |
| `src/components/ui.tsx` | 화면마다 같은 일에 같은 컨트롤: 직접 만든 컨트롤 + 대화상자·시트의 지연 불러오기 래퍼(`Sheet`, `ConfirmDialog`, `MessageDialog`) |
| `src/components/overlays.tsx` | 앱에 남은 Astryx 컴포넌트 전부. 이 파일만 Astryx 컴포넌트를 가져옵니다 |
| `src/styles.css` | 앱의 모든 스타일(직접 만든 컨트롤 포함). 모든 값이 테마 토큰 |

CSS 층(@layer): `reset` → `astryx-base`(Astryx 기본 토큰, 대화상자·시트) → `astryx-theme`(ruma) → `app`(앱). 요소 선택자(`body`, `h1`, `a` …)는 `reset`에, 클래스 규칙은 `app`에 둡니다. 층 밖(unlayered)에는 마스코트 CSS 원본과 `native.css`용 옛 이름 별칭만 둡니다.

테마 모드: 설정의 시스템/라이트/다크가 `useThemeMode`로 `<html data-theme>`를 맞춥니다(시스템이면 속성 없음 → OS를 따름). `<html data-astryx-theme="ruma">`는 `index.html`에 고정되어 있어 첫 그림부터 테마가 적용됩니다. 라이트/다크 값은 토큰마다 `[라이트, 다크]` 한 쌍입니다. `syncTextSize`는 iOS의 글자 크기(Dynamic Type)를 읽어 `--_dynamic-type-*` 배율을 정하고, 테마의 `--font-size-*`가 그 배율을 따릅니다.

## 2. 토큰

### 색 (전통색 → Astryx 역할)

| 토큰 | 라이트 / 다크 | 전통색 | 쓰임 |
| --- | --- | --- | --- |
| `--color-background-body` | `#fbfaf5` / `#1b1a18` | 生成り / 墨 | 화면 바탕, 탭바 |
| `--color-background-surface`, `-card` | `#fffefb` / `#252321` | 胡粉 | 카드, 시트, 대화상자, 버튼 면 |
| `--color-background-muted`, `--color-track` | `#f1ede3` / `#32302c` | 白練 | 세그먼트 바탕, 말풍선, 태그, 막대 빈 곳 |
| `--color-border` | `#e3ded2` / `#403c36` | 灰白 | 카드 테두리(1px), 구분선 |
| `--color-border-emphasized` | `#938f86` / `#716c63` | 灰白→利休鼠 | 입력칸·꺼진 스위치 경계(3:1) |
| `--color-text-primary` | `#2d2a26` / `#ece7db` | 墨 | 본문, 숫자 |
| `--color-text-secondary` | `#6b665d` / `#a39d90` | 利休鼠 | 보조 문장, 라벨, 고스트 아이콘 |
| `--color-accent`(`-muted`, `--color-text-accent`) | `#165e83` / `#86aecf` (`#e1ecf1` / `#24323f`) | 藍 (白藍) | 프라이머리, 현재 위치, 진행 막대, 초점 링, 읽기 |
| `--ruma-edge-accent` | `#0f3f5c` / `#5c86aa` | 紺 | 프라이머리 버튼의 눌림 가장자리 |
| `--color-success`(`-muted`, `--color-text-success`) | `#47885e` (`#e3eee3`, `#2f6b48`) | 緑青 (白緑, 常磐) | 맞은 답, 장기 기억 |
| `--color-error`(`-muted`, `--color-text-error`) | `#c4553b` (`#f6e4dc`, `#9c3b26`) | 朱 (桜, 弁柄) | 틀림, 잊음, 경고, 도장 |
| `--color-warning`(`-muted`, `--color-text-warning`) | `#c89932` (`#f6ecd0`, `#866415`) | 山吹茶 (鳥の子, 黄土) | XP, 익히는 중 |
| `--ruma-stage-mature / -young / -learning` | 緑青 / 浅葱 `#4d9aa6` / 山吹茶 | | 학습 단계 표시에만(막대, 범례, 태그 점) |
| `--ruma-gold-icon` | `#866415` / `#d9b45a` | 黄土 | 켜진 북마크·XP 아이콘에만 |
| `--ruma-flame` | `#d9743f` / `#e08a55` | 柿 | 연속 학습 불꽃에만 |
| `--color-*-blue/red/green/…` | 위 색들로 연결 | | 색 이름 역할(blue=藍, red=朱, green=緑青, yellow=山吹茶, cyan·teal=浅葱, orange=柿). 앱의 `Badge`는 blue·red만 씀 |

**대비(WCAG AA, 측정값)**: 본문 13.7/14.1:1, 보조 글자 4.9~6.5:1, 藍 글자 5.6~7.4:1, 프라이머리 라벨 7.1/7.7:1, 입력 경계 3.08~3.34:1. `tests/unit/theme.test.ts`가 라이트·다크 22쌍씩 검사합니다. 이번에 바꾼 값 두 개(색상은 그대로, 명도만 낮춤):
- 黄土 `#8a6716` → `#866415`(3% 어둡게): 鳥の子 위 4.42 → 4.63:1(익히는 중 배지).
- 입력 경계 `#a7a298` → `#938f86`(12% 어둡게): 胡粉 위 2.52 → 3.20:1, 生成り 위 2.43 → 3.08:1(검색칸·날짜칸·꺼진 스위치). 05 문서의 "약 3:1"은 실제로 2.5였습니다.

### 글자

| 토큰 | 크기 | 쓰임 |
| --- | --- | --- |
| `--font-size-sm` | 12 | 칩·태그·단위·보조 숫자 |
| `--font-size-base` (`--text-supporting-size`, `--text-label-size`) | 14 | 보조 문장, 라벨, 링크형 버튼 |
| `--font-size-lg` (`--text-body-size`) | 16 | 본문, 버튼 라벨, 카드 제목 |
| `--font-size-xl` (`--text-heading-2-size`) | 20 | 뜻, 읽기, 큰 개수 |
| `--font-size-2xl` (`--text-heading-1-size`) | 24 | 화면 제목, 큰 숫자, 학습 카드의 뜻 |
| `--font-size-3xl` | 32 | 준비도 숫자, 완료 제목 |
| `--font-size-4xl` | 44 | 단어 시트의 표제어 |

예외는 학습 카드 표제어 하나(`clamp(44px, 16vw, 76px)`)와 탭 라벨(`--font-size-xs` 11)입니다. 굵기는 **500(기본)과 700(강조·숫자·버튼)** 두 단계, 긴 도움말만 400. Astryx의 semibold도 700으로 맞췄습니다. 줄간격 본문 1.5, 제목 1.3, 숫자 1.1.
- **한국어**: 본문 글꼴 `--font-family-body`(SF Pro Rounded는 라틴 숫자에만, 한글은 SD Gothic Neo/Pretendard). `word-break: keep-all` — 단어 사이에서만 줄바꿈.
- **일본어**: 읽기·보기는 `--ruma-font-ja`(히라기노 각고딕), 표제어는 `--ruma-font-ja-serif`(히라기노 명조, 600). `[lang='ja']`를 꼭 붙입니다(줄바꿈은 일본어 규칙).
- 웹 글꼴은 받지 않습니다(오프라인 우선). 모두 기기 글꼴입니다.

### 간격 · 모서리 · 크기 · 깊이 · 움직임

- 간격은 Astryx의 4px 단계 그대로: 화면 좌우 `--spacing-4`(16, 안전 영역보다 작지 않게), 카드 안 `--spacing-4`, 카드 사이 `--spacing-3`, 섹션 사이 `--spacing-6`.
- 모서리: `--radius-inner` 8(칩 안쪽·히트맵) · `--radius-element` 12(버튼·입력·세그먼트) · `--radius-container` 16(카드) · `--radius-page` 24(학습 카드·시트 위) · `--radius-full`(알약).
- 컨트롤 높이: `--size-element-sm/md/lg` = 36 / **44** / 52. 누르는 것은 모두 44 이상, 평가 버튼만 60.
- 깊이: **누를 수 있는 것에만** 얕은 가장자리 `--ruma-depth`(3px, 급수 행은 2px). 카드는 1px 선, 그림자 없음. 그림자(`--shadow-med/high`)는 떠 있는 층(시트·대화상자·저장 실패 배너)에만.
- 움직임: `--duration-fast/medium/slow` 120/200/400ms, 곡선 하나 `cubic-bezier(0.2, 0, 0, 1)`. 상태가 바뀔 때만 움직이고, 반복 애니메이션은 화면당 하나(마스코트). **동작 줄이기**를 켜면 CSS 애니메이션·전환은 모두 꺼지고(`styles.css` 끝의 전역 규칙), Astryx의 스크립트 움직임(시트)은 자체 규칙대로 짧은 페이드로 바뀝니다.

## 3. 컴포넌트

### 직접 만든 것 (`src/components/ui.tsx`)

props 이름은 Astryx를 따랐습니다(`label`, `variant`, `isDisabled` …). 스타일은 `styles.css`의 같은 이름 클래스.

| 컴포넌트 | 어디에 | 요점 |
| --- | --- | --- |
| `Button` (`.btn`) | 모든 글자 버튼. 평가 버튼(`.grade`, 60px), 오늘의 학습 시작, 백업 | `variant` primary·secondary·destructive·ghost, `size` sm 36·md 44·lg 52, `width="100%"`, `href`면 링크, `isDisabled`는 `aria-disabled`(초점은 받고 동작 안 함, 50% 흐림), `children`을 주면 `label`이 접근 이름 |
| `IconButton` (`.icon-btn`) | 닫기·발음·북마크(`aria-pressed`, 켜지면 金)·되돌리기·뒤로(링크) | 44px 정사각, Lucide 아이콘은 준 크기(기본 22) 그대로 |
| `Card` (`.card`) | 홈의 준비도·계획·이번 주, 기록, 설정 묶음, 급수 요약 | 1px 선, 그림자 없음, 선 포함 16px 안쪽(`padding={3}`이면 12) |
| `Choice` (`.segmented`) | 목표 급수·하루 새 단어·시험날 목표·테마, 단어장 탭 | `role="radiogroup"`/`radio`, 화살표·Home·End로 이동하며 고름(선택이 초점을 따름), 고른 칸만 탭 순서에 |
| `ChipGroup` (`.chip`) | 시험일, 단어 유형, 기억 단계 | `aria-pressed`, 줄바꿈(또는 `scroll`), 40px + 위아래 2px 보이지 않는 누름 영역 |
| `Switch` (`.switch-field`) | 아래 급수 함께, 한자어 빠른 통과, 발음 자동 재생 | `<input type="checkbox" role="switch">`: 키보드·화면 낭독기 기본 동작. 줄 전체가 누름 영역, 트랙 40×24 + 44px 누름 영역. 이름은 라벨, 설명은 `aria-describedby` |
| `SearchField` (`.search-field`) | 단어 검색 | `type="search"`, 지우기 버튼(`단어 검색 지우기`, 지운 뒤 입력칸으로 초점), 초점은 藍 테두리 + 白藍 안쪽 링 |
| `ProgressBar` (`.progress`) | 학습 진행, 준비도(목표 = `mark`, 2px 먹 눈금) | `role="progressbar"`, `valueText`가 읽히는 문장. 줄무늬 없는 평평한 막대 |
| `Badge` (`.badge`) | 새 단어, 다시 나와요, 읽기, 급수, 목표 | neutral·blue·red |
| `Banner` (`.banner`) | 저장 실패(error, 떠 있음), 가져오기 되돌리기(success) | 아이콘·제목·설명, 선택적 행동과 닫기 |
| `Empty` (`.empty`) | 검색 결과·북마크·약한 단어·필터 결과 없음 | `role="status"`로 나타날 때 읽힘 |
| `Skeleton` (`.skeleton-block`) | 단어를 불러오는 동안의 학습 카드 | 느린 깜빡임(동작 줄이기면 멈춤) |
| `RowLink` (`.row-link`) | 홈의 "약한 단어"·"기록" 줄, 설정 › 정보의 "개인정보 처리방침"·"도움말 · 문의" | 48px 줄 + 셰브런, 아래 1px 선. `newWindow`면 새 창(웹의 공개 페이지) |

### Astryx (`src/components/overlays.tsx`, 따로 불러옴)

| 래퍼(`ui.tsx`) | Astryx | 어디에 | 얻는 것 |
| --- | --- | --- | --- |
| `Sheet` | `BottomSheet` | 단어 시트, "이 숫자는 무엇인가요?" | 손잡이, 아래로 밀어 닫기, 바깥 탭·Esc 닫기, 초점 가둠·연 곳으로 복귀, 높이 맞춤 |
| `ConfirmDialog` | `AlertDialog` | 모든 기록 초기화(destructive), 백업으로 바꾸기(primary) | 브라우저 `confirm()` 대체. 초점은 `취소`(안전한 선택)에서 시작, 초점 가둠, Esc·취소로 닫으면 연 버튼으로 복귀 |
| `MessageDialog` | `Dialog` | "가져오지 못했어요" | 브라우저 `alert()` 대체 |

불러오는 방식: 래퍼는 `React.lazy`로 `overlays.tsx`를 가져옵니다. 처음 화면을 그린 뒤 앱이 쉴 때(`requestIdleCallback`, 없으면 2초 뒤) `preloadOverlays`가 묶음을 불러오고, 그때부터 모든 대화상자·시트가 닫힌 채로 붙어 있습니다(그래서 열기는 상태만 바뀜, 닫힘 움직임과 초점 복귀가 늘 같음). 그 전에 누르면 그 자리에서 불러와 붙인 뒤 한 프레임 뒤에 엽니다(연 곳을 기억하고 들어오는 움직임을 하도록). Astryx `<Theme>` 공급자는 쓰지 않습니다: Astryx 컴포넌트는 `<html data-astryx-theme="ruma">`를 보고 `registerTheme(rumaTheme)`로 등록된 테마의 아이콘을 씁니다.

오프라인: 서비스 워커(workbox)가 `dist/**/*.js, css`를 모두 미리 캐시하므로 따로 불러오는 묶음도 설치 때 함께 받아 둡니다. iOS 앱은 모든 파일이 앱 안에 있습니다.

## 4. 규칙

**강조 단계** — 한 화면, 한 버튼 묶음에서 위에서부터 하나씩만:
1. `primary`(藍 면, 紺 가장자리): 묶음마다 **하나**. 오늘의 학습 시작, 정답 보기, 알아요, 홈으로.
2. `secondary`(胡粉 면, 1px 선, 灰白 가장자리): 나머지 선택지. 모르겠어요, 쉬워요, 백업 내보내기.
3. `destructive`(桜 면, 弁柄 글자): 지우는 동작. 프라이머리 색을 쓰지 않습니다. 반드시 한 번 묻습니다(`ConfirmDialog`. 오류 화면만 화면 안에서 묻습니다: 앱이 망가진 상태에서도 동작해야 해서).
4. `ghost`: 아이콘 버튼(利休鼠), 되돌리기 칩. 글자 행동은 `ghost` + `text-action`(藍 글자, 상자 없음): 바꾸기 ›, 되돌리기, 백업하기.

**표면** — 정적인 묶음은 `Card`(1px 선, 그림자 없음). 카드 안에 카드를 넣지 않고 `--color-background-muted` 상자(말풍선, 계획 메모, 고지문)로 구분합니다. 잠깐 보는 상세는 `Sheet`, 결정을 묻는 것은 `ConfirmDialog`, 한 줄 결과는 화면 안 `role="status"` 문장, 지속되는 문제는 `Banner`.

**상태** — 누르면 얕은 가장자리(3px)로 면이 가라앉고 옅은 누름 막(`--color-overlay-pressed`)이 덮입니다. 마우스가 있는 기기에서만 hover 막. 초점은 3px 藍 링(`--focus-outline-*`, `:focus-visible`). 비활성은 `isDisabled`(aria-disabled, 50%).

**색 쓰임** — 藍은 행동·현재 위치·진행에만. 朱은 틀림·경고·도장. 단계 색은 단계 표시에만. 金·柿은 아이콘에만. 색만으로 뜻을 전하지 않습니다(단계 태그에 글자, 정답·오답 보기에 ✓/✕).

**접근성** — 누르는 영역 44px 이상(칩은 40px + 위아래 2px, 스위치는 트랙 둘레로 44px), 겹 대화상자는 Esc로 닫히고 연 버튼으로 초점이 돌아갑니다. 상태 변화는 `aria-live`/`role="status"`로 알립니다. 안전 영역: 페이지·학습 화면·탭바·시트·온보딩 버튼은 `env(safe-area-inset-*)`.

## 5. 새 화면을 만들 때

1. 화면 루트는 `.page` 안(탭이 있는 화면) 또는 `.study`/`.onboard`(전체 화면). 맨 위는 `header.top > h1`.
2. 묶음은 `<Card role="region" aria-labelledby>` + `h2.card-title`. 카드 사이 간격은 `.page`의 `gap`이 맡습니다.
3. 선택지 2~5개는 `Choice`, 많거나 길면 `ChipGroup`, 켜고 끄기는 `Switch`, 행동은 `Button`(프라이머리 하나), 아이콘만이면 `IconButton`(라벨 필수).
4. 묻기는 `ConfirmDialog`, 알림은 `MessageDialog`, 상세는 `Sheet`(늘 렌더하고 `isOpen`만 바꿈 — 닫힘 움직임과 초점 복귀). 새 Astryx 컴포넌트가 필요하면 `overlays.tsx`에만 가져오고 `npm run theme`(그 컴포넌트의 CSS가 `astryx-overlays.css`에 들어감). 다른 파일에서 `@astryxdesign/core/*` 컴포넌트를 가져오면 공통 기반(약 150KB gzip)이 처음 묶음으로 들어옵니다.
5. 비어 있을 때는 `Empty`(무엇이 비었는지 + 어떻게 채워지는지).
6. 새 CSS는 `@layer app` 안에, 값은 토큰만. 새 색이 필요하면 `rumaTheme.ts`에 토큰을 더하고 `npm run theme`, 대비 쌍을 `tests/unit/theme.test.ts`에 추가.
7. 390·320px, 라이트·다크, 동작 줄이기로 확인합니다.

## 6. 직접 만든 것과 이유

3장의 컨트롤은 9장의 측정 때문에 직접 만들었습니다(Astryx로 두면 JS가 3배). 그 밖에 처음부터 직접 만든 것:

| 부품 | 이유 |
| --- | --- |
| 학습 카드(`.flash`)·평가 버튼 줄 | 제품의 핵심 동작(두 단계 답, 60px 고정, 엄지 위치) |
| 읽기 4지선다(`.choice`) | 정답/오답 표시 상태가 제품 고유. 버튼과 같은 면·가장자리 규칙 |
| 준비도 카드·오늘의 계획·이번 주(요일 점)·도장 여정·복습 예보·히트맵·급수 단계 막대 | 데이터 시각화. Astryx 차트는 아직 정식 배포 전(canary) |
| 단어 행(`.word-row`)·급수 행 | 명조 표제어 + 읽기 + 뜻 + 태그의 2줄 배치, 200행 목록의 가벼움 |
| 하단 탭바 | Astryx에 하단 탭바가 없음(`MobileNav`는 서랍 메뉴). Lucide 아이콘 |
| 단어 유형 메모(가짜 친구, 한자음 대응) | 내용이 제품 고유 |
| 마스코트 루마 | 컴포넌트와 CSS 그대로 |
| 처리방침·도움말 화면(`src/screens/Doc.tsx`, `.doc`) | `public/privacy/`·`public/support/`의 정적 페이지(`npm run pages`가 `docs/store/`에서 만듦) 본문을 iOS 앱 안에서 보여 줌. 정적 페이지 자체는 앱 CSS 없이 같은 팔레트(`rumaTheme.ts`에서 읽음)로 라이트/다크 |
| iOS 앱 전용 설정·알림 제안(`src/platform/`) | 플랫폼 층은 손대지 않음. 같은 `.card`·`.btn`·`.chip-btn`·스위치 트랙 스타일을 씀 |

## 7. 쓰지 않은 것과 이유

- **Astryx `Button`·`IconButton`·`Card`·`SegmentedControl`·`ToggleButton`·`Switch`·`TextInput`·`ProgressBar`·`Badge`·`Banner`·`EmptyState`·`Skeleton`**(전에는 썼음): 9장. 처음 묶음에 하나라도 있으면 공통 기반이 따라옵니다. 특히 `Switch`는 혼자 98KB(gzip)를 끌고 옵니다(툴팁·필드·스피너·국제화).
- **`Theme` 공급자**: 토큰은 CSS 변수라 런타임이 필요 없습니다. 공급자 자체가 27KB(gzip)이고 공통 기반을 처음 묶음으로 끌어옵니다. 하던 일(모드, Dynamic Type)은 `themeRoot.ts` 60줄.
- **`astryx.css` 전체**: 모든 컴포넌트의 스타일이 한 파일(gzip 41KB). 쓰는 부분만 뽑습니다(8장, `build-theme.mjs`).
- **`List`/`ListItem`**: 홈의 링크 두 줄에 23KB(gzip). 단어 행에도 쓰지 않습니다.
- **`DateInput`**: 달력 팝오버가 앵커 위치 지정(iOS 26 이상)에 기대고, iOS의 기본 날짜 휠이 더 낫습니다. 기본 `<input type="date">`를 토큰으로 스타일.
- **`Toast`**: 되돌리기는 엄지 근처에 머물러야 해서 화면 안 칩으로 둡니다.
- **`Tooltip`, `Text maxLines`**: 앵커 위치 지정이 필요하고 휴대폰에는 hover가 없습니다. 준비도의 목표 눈금 툴팁도 뺐습니다(목표는 막대 아래 글자와 `aria-valuetext`에 있음).
- **`MobileNav`, `AppShell`, `Layout`**: 서랍·데스크톱 구조라 하단 탭에 맞지 않습니다.
- **소스 빌드(`@astryxdesign/build`, StyleX)**: CSS를 줄이지만 그 CSS는 Vite를 거치지 않아 `light-dark()`가 남고(iOS 17.5 미만에서 색이 깨짐) 빌드가 1초→9초가 됩니다. 미리 빌드된 `astryx.css`에서 쓰는 규칙만 뽑는 쪽이 더 작고(대화상자·시트 14KB) 빌드도 그대로입니다.
- **기성 테마 패키지(`theme-*`)와 웹 글꼴**: 기성 테마의 글꼴은 Google Fonts에서 받아 오프라인과 맞지 않습니다.

## 8. 브라우저 · iOS

**최소 iOS: 16.4**(앱의 `IPHONEOS_DEPLOYMENT_TARGET`, 2026-11-14 소유자 결정, `docs/plan/10-ios-build.md` 결정 3).

- 처음 묶음(직접 만든 컨트롤)이 기대는 것: `@layer`(15.4), `:focus-visible`(15.4), `dvh`(15.4), `color-mix()`(16.2), `inset`·`aspect-ratio`(15), `appearance: none` 체크박스의 `::before`/`::after`(스위치), `ResizeObserver`(Dynamic Type). `text-wrap: balance/pretty`는 없어도 그만인 꾸밈입니다.
- 테마: `light-dark()`(17.5)는 Vite의 CSS 최소화기(Lightning CSS, 대상 safari16.4)가 `--lightningcss-light/dark` 변수 전환으로 바꿉니다. `astryx theme build`가 쓰는 `@scope`(17.4)는 `npm run theme`이 `:where([data-astryx-theme="ruma"])` 접두로 펼칩니다. 빌드 결과에 `light-dark(`·`@scope`가 없는지 업그레이드 때 확인합니다(10장).
- 대화상자·시트(Astryx): `<dialog>`(15.4), `:has()`(15.4), `@property`(16.4) — 16.4가 최소인 이유의 하나. `@starting-style`(17.5)·`transition-behavior: allow-discrete`(17.4)로 쓰인 나타나기 움직임은 16.4~17.4에서 빠질 수 있습니다(동작·초점은 그대로, 기기 확인 필요). 팝오버·앵커가 필요한 컴포넌트는 쓰지 않습니다.
- `requestIdleCallback`이 없는 Safari에서는 대화상자 묶음을 2초 뒤에 불러옵니다.
- 15.0~15.3은 `@layer`를 몰라 스타일 전체가 빠지므로 지원하지 않습니다. 16.4보다 높여야 할 기능은 쓰지 않았습니다.

## 9. 무게 (웹 빌드, gzip -9)

### 무엇이 무거운가 (2026-11-14 측정: 컴포넌트 조합마다 따로 빌드한 최소 앱의 JS)

| 조합 | JS gzip | React 위로 |
| --- | --- | --- |
| React만 | 65.9KB | — |
| + `Theme` 공급자 | 93.1KB | +27.2 |
| + `Switch` 하나 | 163.9KB | +98.0 |
| + `BottomSheet` 하나 | 125.7KB | +59.8 |
| + `Dialog`·`AlertDialog` | 167.9KB | +102.0 |
| + `Dialog`·`AlertDialog`·`BottomSheet` | 209.7KB | +143.8 |
| + 대화상자·시트·`Switch`·`Theme` | 246.0KB | +180.1 |
| + 위에 버튼·카드·세그먼트·칩·검색칸·막대·배지·배너·빈 상태·스켈레톤까지 전부 | 271.6KB | +205.7 |

결론: 나머지 열 가지를 직접 만들어도 26KB만 줄어듭니다(그중 `SegmentedControl` 14KB, `TextInput` 4KB). 무게는 공통 기반(레이어·움직임·제스처·국제화·StyleX 런타임)과 `Switch`·`Theme`에 있습니다. 그래서 (1) 스위치와 테마 공급자까지 직접 만들어 **Astryx를 처음 묶음에서 완전히 빼고**, (2) 대화상자·시트는 따로 불러오고, (3) CSS는 쓰는 규칙만 뽑았습니다.

CSS: `astryx.css`는 41.3KB(gzip). 기본 토큰 중 앱이 읽고 테마가 정하지 않는 것만 0.8KB, 대화상자·시트의 규칙만 13.8KB(2,707개 중 976개).

### 결과

| | Astryx 이전 | Astryx 전부(이전 단계) | **지금** |
| --- | --- | --- | --- |
| 처음 불러오는 JS | 326.6KB / **102.3KB** | 981.7KB / **313.2KB** | 334.4KB / **105.7KB** |
| 따로 불러오는 JS | — | 2.3KB / 1.2KB | 478.2KB / 149.5KB(대화상자·시트, 툴팁) |
| 처음 불러오는 CSS | 30.4KB / **6.8KB** | 329.4KB / **51.2KB** | 61.0KB / **10.7KB** |
| 따로 불러오는 CSS | — | — | 91.1KB / 13.8KB |
| PWA 사전 캐시 | 20개 1,474.9KiB | 22개 2,409.0KiB | 23개 **2,068.3KiB** |
| 홈까지(CPU 4배 감속, 중앙값 2회) | 584 / 570ms | 880 / 855ms | **570 / 530ms** |
| 첫 시트 열기(CPU 4배, 홈에서 ⓘ, 중앙값) | — | 236ms | 204ms(미리 불러온 뒤) |

홈까지 시간은 같은 기계에서 세 빌드를 번갈아 9번씩 잰 중앙값입니다(이전 문서의 669/1,092ms는 다른 때 잰 값이라 직접 비교하지 않습니다). 미리 불러오지 않으면 첫 시트는 약 540ms 걸려서(묶음 해석 + 시트를 처음 붙이는 비용) 쉬는 동안 미리 불러옵니다. 처음 JS가 Astryx 이전보다 3.4KB 큰 것은 직접 만든 컨트롤·Dynamic Type·지연 불러오기 래퍼입니다. 처음 CSS 10.7KB는 Astryx reset 3.8KB, 테마 2.8KB, 기본 토큰 0.8KB, 앱 스타일입니다.

## 10. Astryx 업그레이드

베타라서 **정확한 버전**으로 고정합니다(`package.json`: `@astryxdesign/core`, `@astryxdesign/cli`, `@stylexjs/stylex` 범위 없이. StyleX는 Astryx 런타임의 피어 의존성).

1. 변경 기록 확인: `node_modules/@astryxdesign/core/CHANGELOG.md`, `npx astryx blog`.
2. 올리기: `npm i -E @astryxdesign/core@<새 버전> @astryxdesign/cli@<새 버전>` (StyleX 피어 버전도 맞춤).
3. 코드모드 미리보기 → 적용: `npx astryx upgrade --from 0.7.15` → `npx astryx upgrade --from 0.7.15 --apply` (`--list`로 목록). 바뀌는 곳은 `overlays.tsx`와 `rumaTheme.ts`뿐이어야 합니다.
4. 테마와 뽑은 CSS 다시 빌드: `npm run theme`. 오래된 빌드 테마는 런타임이 고쳐 주지 않습니다. `astryx-overlays.css`의 규칙 수가 크게 변하면(지금 976개) 이유를 봅니다.
5. 확인: `npx tsc --noEmit`, `npm test`(대비·호환 검사 포함), `npm run test:e2e`(대화상자·시트의 초점·Esc·닫기 포함), `npm run build`·`build:native`, 출력 CSS에 `light-dark(`·`@scope (`가 없는지, 처음 묶음 JS에 Astryx가 없는지(`dist/assets/index-*.js`에서 `astryx` 검색), 390/320 라이트·다크 스크린숏(특히 대화상자·시트).
6. 아래 알려진 문제가 고쳐졌는지 보고, 고쳐졌으면 우회 코드를 지웁니다.

`build-theme.mjs`의 CSS 뽑기는 StyleX가 컴파일한 Astryx JS가 쓸 수 있는 클래스를 모두 문자열로 적어 둔다는 점에 기댑니다(동적으로 만든 클래스 이름은 없음). 이 전제가 깨지면 대화상자·시트의 스타일이 빠지니 5번 스크린숏으로 확인합니다.

## 11. 알려진 문제 · 우회

- 0.7.15 `theme build`가 `isPressed` 같은 낙타 표기 상태를 `[data-is-pressed="isPressed"]`로 써서 맞지 않음 → 지금은 칩을 직접 만들어 영향 없음.
- 테마 대상에 `:active`가 없음 → 대화상자 안 Astryx 버튼의 "눌리는 가장자리"는 `styles.css`의 `.astryx-button:active`로 지정.
- `@starting-style`이 없는 iOS 16.4~17.4에서 대화상자·시트가 움직임 없이 나타날 수 있음(8장).
