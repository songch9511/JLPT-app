# JLPT 루마 — 간격 반복 단어장

> JLPT 루마는 일본국제교류기금(JF)·일본국제교육지원협회(JEES)와 관계없는 비공식 학습 앱이며, 두 기관이 승인하거나 후원하지 않습니다. JLPT(일본어능력시험)는 해당 기관의 상표입니다.

마스코트 루마와 함께 간격 반복으로 겹겹이 쌓는 JLPT 단어 학습 PWA. 설치 없이 브라우저에서 열고, 홈 화면에 추가하면 앱처럼 오프라인으로 쓸 수 있습니다.

## 학습 방식 — 간격 반복

Anki가 쓰는 오픈소스 스케줄러 [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)로 단어마다 "잊을 때쯤"을 계산해 그때 다시 보여 줍니다.

- 카드마다 **모르겠어요 / 알아요 / 쉬워요** 중 하나를 고릅니다. 버튼 아래에 그 단어가 다시 나올 시점이 표시됩니다.
- 새 단어는 같은 날 몇 분 간격으로 다시 확인한 뒤, 며칠 → 몇 주 → 몇 달로 간격이 벌어집니다.
- 복습에서 잊은 단어는 10분 뒤 다시 나오고 간격이 짧아집니다.
- 하루 분량은 "그날 돌아온 복습 + 새 단어 N개(기본 20, 최대 40)"입니다. 다 넘기면 끝이고, 중간에 나가도 그대로 이어집니다.
- 목표 유지율은 90%, 복습 간격이 21일 이상인 단어를 "장기 기억"으로 셉니다.

## 기능

- 시험 준비도(홈 맨 위): 목록 단어 중 시험날 아침에 기억할 것으로 예상되는 수(FSRS 망각 곡선, `src/readiness.ts`). "지금 그만두면"과 "계획대로면" 두 값과 목표(기본 80%)를 보여 줍니다. 어휘만 다루는 비공식 목록 기준 추정이고 합격 확률이 아닙니다.
- 오늘의 계획: 복습·새 단어 수, 예상 소요 시간(측정한 답변 속도), 오늘 하면 늘어나는 예상 단어 수, 목표에 못 미칠 때 하루 새 단어 수 제안(최대 40)
- 아래 급수 포함: 새 학습자는 목표 급수 아래 단어(예: N3 목표면 N5·N4)도 쉬운 급수부터 배웁니다. 설정에서 끄고 켤 수 있습니다.
- 게임 요소: 카드마다 XP(답과 무관하게 10), 연속 학습, "오늘 분량 끝내기" 퀘스트, 예상 기억 50단어마다 찍히는 도장, 마스코트 루마(학습을 시작하면 한쪽 눈을, 오늘 분량을 끝내면 두 눈을 다 뜸)
- 기록 탭: 도장 여정, 기억 유지율(예측 대비), 최근 학습 시간, 7일 복습 예보, 학습 기록 히트맵, 누적 XP
- 학습 세션: 앞면은 "모르겠어요 / 정답 보기", 정답을 본 뒤 "모르겠어요 / 알아요 / 쉬워요". 되돌리기, 발음 듣기, 북마크, 키보드(Space·Enter 정답 보기 · 1/← 모름 · 2/→ 앎 · 3/↑ 쉬움)
- 단어장: 급수별 기억 상태와 단어 목록, 전체 검색, 북마크, 자주 잊는 약한 단어
- 라이트/다크 테마, 백업 내보내기/가져오기

학습 기록은 브라우저(localStorage)에만 저장됩니다. 단어 설명과 이야기는 나중에 미리 만든 데이터와 서버로 제공할 예정이라 지금은 없습니다(`src/content.ts`).

## 색 · 디자인 시스템

일본 전통색(伝統色)에서 고른 차분한 팔레트를 [Astryx](https://github.com/meta/astryx) 테마 형식의 `ruma`로 정의합니다(`src/themes/ruma/rumaTheme.ts`, 빌드 `npm run theme`). 테마가 색·글자·간격·모서리·움직임의 유일한 출처이고, 결과는 평범한 CSS 변수입니다. 버튼·카드·세그먼트·칩·스위치·검색칸·진행 막대 같은 컨트롤은 그 토큰으로 직접 만든 가벼운 컴포넌트(`src/components/ui.tsx`)이고, Astryx 컴포넌트는 확인·알림 대화상자와 아래 시트에만 쓰며 처음 화면에는 싣지 않고 따로 불러옵니다. 토큰·컴포넌트·규칙·무게는 **[docs/design-system.md](docs/design-system.md)** 에 있습니다. 다크 모드는 먹(墨) 바탕입니다. iOS 앱의 최소 버전은 16.4입니다.

| 역할 | 라이트 | 다크 | 이름 |
| --- | --- | --- | --- |
| 바탕 | `#fbfaf5` | `#1b1a18` | 生成り 키나리 / 墨 |
| 글자 | `#2d2a26` | `#ece7db` | 墨 스미 |
| 강조(버튼 묶음마다 하나) | `#165e83` | `#86aecf` | 藍 아이 |
| 알아요 · 장기 기억 | `#47885e` | `#7fb996` | 緑青 로쿠쇼 |
| 모르겠어요 · 경고 | `#c4553b` | `#e08c74` | 朱 슈 |
| XP · 익히는 중 | `#c89932` | `#d9b45a` | 山吹茶 야마부키차 |
| 다지는 중 | `#4d9aa6` | `#6fb3bd` | 浅葱 아사기 |
| 연속 학습 | `#d9743f` | `#e08a55` | 柿 카키 |

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입 검사 + 프로덕션 빌드 (dist/)
npm run theme    # rumaTheme.ts → ruma.css·ruma.js, Astryx CSS에서 쓰는 부분만(astryx-tokens.css·astryx-overlays.css)
npm run data     # data/raw + data/ko → public/data 재생성
```

## 배포

`main`에 푸시되면 `.github/workflows/deploy.yml`이 빌드해서 GitHub Pages에 올립니다.
저장소 Settings → Pages → Source가 "GitHub Actions"로 설정되어 있어야 합니다.

## 단어 데이터

- 단어 목록: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT, tanos.co.uk 기반) — `data/raw/`
- 한국어 뜻: `data/ko/n{급수}-*.json` (`{ "<idx>": "뜻" }`). N5~N1 전체(8,130개)에 들어 있습니다. 모델이 번역한 것으로 표본만 확인했습니다.
- 뜻을 고치려면 `data/ko/`의 해당 항목을 수정하고 `npm run data`를 실행합니다. (`node scripts/make-chunks.mjs <급수>`는 번역용 TSV를 만듭니다.)
- 단어 빈도·소개 순서(`data/freq/`), 단어 유형 태그(`data/tags/`)와 한국 한자음(`data/hanja/`)은 `npm run data`가 `public/data/n*.json`의 각 행 뒤에 열로 붙입니다(앞 네 열과 행 순서는 그대로). 만드는 법과 형식은 `docs/plan/08-word-data.md`.

### 출처와 라이선스

- 단어 목록: open-anki-jlpt-decks (MIT), tanos.co.uk 목록 기반. JLPT 공식 목록이 아닙니다.
- 단어 빈도: [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1, Robyn Speer — 데이터 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). wordfreq에는 OPUS [OpenSubtitles 2018](http://opus.nlpl.eu/OpenSubtitles.php)(원자료 http://www.opensubtitles.org/), Wikipedia, 웹 텍스트, Twitter, Reddit 등의 자료가 들어 있습니다.
- 사전 데이터: [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)·[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) © Electronic Dictionary Research and Development Group, [EDRDG 라이선스](https://www.edrdg.org/edrdg/licence.html)(Creative Commons Attribution-ShareAlike).
- 한국 한자음: [Unicode Unihan](https://www.unicode.org/reports/tr38/) `kHangul`, © Unicode, Inc., Unicode License v3 (고지문 전문은 `data/hanja/NOTICE.md`).
- 위 자료에서 계산한 열(빈도 `f`, 소개 순서 `o`, 유형 태그의 한자음 후보와 읽기 분할 `a`)과 `data/freq/`, `data/hanja/`는 CC BY-SA 4.0으로 배포합니다. 고지문: `public/data/NOTICE.txt`(앱에서는 설정 → 정보). 이 라이선스가 `public/data/n*.json` 파일 전체(한국어 뜻 포함)에 미치는지는 아직 정하지 않았습니다(`docs/plan/08-word-data.md` 결정 1).
