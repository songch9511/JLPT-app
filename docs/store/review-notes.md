# App Review notes (English)

Written 2026-11-14. Section 1 goes into App Store Connect › App Review Information › Notes as is. Apple limits that field to **4,000 bytes** ([Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), checked 2026-11-14); the block below is **3,432 bytes** (UTF-8, counted with Python). Section 2 has prepared replies for the Resolution Center if a reviewer raises one of the likely issues; do not paste them pre-emptively.

This replaces the shorter draft in `docs/plan/10-ios-build.md` §6 (same facts, plus the quick tour, data sources and the estimate wording). Remove the widget line if the widget does not ship in 1.0 (10, decision 4).

Sign-in information: tick **"Sign-in required: No"**. No demo account is needed.

## 1. Notes (paste)

```
JLPT Ruma (JLPT 루마) is a Korean-language vocabulary trainer for Korean speakers preparing for the Japanese-Language Proficiency Test (N5-N1). It schedules reviews with the FSRS spaced-repetition algorithm and estimates how many words of the learner's list they will still remember on the exam day.

NO LOGIN. No account, no network use, no data collected. All 8,130 words are bundled; study records stay on the device. The UI is Korean; key labels are given below.

QUICK TOUR (about 3 minutes)
1. First launch opens on Home: the mascot asks the target level (tap e.g. N3), then the exam date (a date, or 아직 몰라요 = not sure yet), then tap 첫 학습 시작 (Start first session). New words per day default to 20 (Settings).
2. Home (홈): card 시험날 기억할 단어 (예상) = estimated words remembered on the exam day. On a fresh install the number starts near zero and the on-track label appears after about 30 review answers.
3. Tap 오늘의 학습 시작 (Start today's study). Meaning cards: tap the card, then answer 모르겠어요 / 알아요 / 쉬워요 (don't know / know / easy). Words that share a Korean hanja reading (e.g. 産業 = 산업) come as reading cards: pick the reading among four, the app then shows the Korean-to-Japanese reading bridge. Words whose meaning differs from the Korean look-alike (e.g. 大丈夫) show a red "meaning differs" note.
4. Tabs: 단어장 (Words: search all 8,130 words, word sheet), 기록 (Records: stamps, 7-day review forecast, calendar), 설정 (Settings).

iOS-ONLY FEATURES (not in the web version)
1. Review reminders (local notifications). Permission is asked only after the first finished daily session, from an explanation card, never at launch. At most one a day, at the chosen time, only on days with reviews due, with the real count. To test: Settings > 알림 · 진동 · 발음 > turn on 복습 알림, set the time 2 minutes ahead, start today's study, answer 모르겠어요 on two cards, leave the app.
2. Home Screen widget 오늘의 복습: today's reviews and the exam-day estimate (small and medium).
3. Japanese pronunciation with on-device iOS voices (speaker button on every card); voice choice in Settings.
4. Haptics when answering and when the day is finished (respects Reduce Motion).
5. Backup export through the share sheet / Files, import through the document picker (Settings > 데이터).
6. Works fully offline, including the first launch (try Airplane Mode).

NOT AFFILIATED. This app is not affiliated with, endorsed or sponsored by the Japan Foundation or JEES, which administer the JLPT. "JLPT" is used only to say which exam the word lists prepare for; no official logo, test questions or materials are used. The notice is in Settings > 정보 (About) and in the App Store description.

DATA SOURCES AND LICENCES (Settings > 정보)
- Word list: open-anki-jlpt-decks (MIT), based on the tanos.co.uk lists (Jonathan Waller). The JLPT publishes no official vocabulary list.
- Frequency order: wordfreq (CC BY-SA 4.0). Dictionary data: JMdict and KANJIDIC2 (EDRDG, CC BY-SA). Korean hanja readings checked against Unicode Unihan (Unicode License v3).
- Korean meanings: machine translation, not yet fully reviewed; the app says it may contain errors.

The estimate is not a pass probability: the app says so on the home card (it covers vocabulary only, not grammar, reading or listening).

Contact: [name] [email] [phone]
```

## 2. Likely issues and prepared replies

### 4.2 / 4.2.2 Minimum functionality ("repackaged website")

Risk: the app is a Capacitor web view around the same React code as the web version (`https://songch9511.github.io/JLPT-app/`). Guideline 4.2 asks for "features, content, and UI that elevate it beyond a repackaged website"; 4.2.2 excludes "web clippings, content aggregators, or a collection of links" (quoted from the guidelines page, 2026-11-14).

Reply:
> The app is not a wrapper around a website: it does not load any remote page. The whole app, its 8,130-word data set and the scheduler run from the app bundle and work in Airplane Mode from the first launch. It offers iOS features the website cannot: local review reminders with the day's real count, a WidgetKit Home Screen widget, on-device Japanese speech via AVSpeechSynthesizer with voice choice, haptic feedback, share-sheet backup export and document-picker import, and durable storage in the app's Library folder. Steps to see each are in the review notes.

Before submitting, make sure this is true on the build: the device checklist in `docs/plan/10-ios-build.md` §5 passed (reminders, widget, voice, haptics, offline first launch). If the widget is cut, say "five iOS features" and drop it from the list.

### 5.2.1 / 2.3.7 / 4.1 Intellectual property: "JLPT" in the name

Risk: "JLPT" is the name of the exam run by the Japan Foundation and JEES. Several unofficial sites mark it as their trademark; registration was **not checked** in KIPRIS/J-PlatPat (06 §4.2, 02 §6.2). The product name begins with "JLPT".

Reply:
> "JLPT" is used only descriptively, to tell learners which exam the vocabulary lists prepare for, as many study apps on the App Store do. The app does not use any official logo, exam question, test material or design, and it does not claim to be official. It states in the app (Settings > 정보) and in the description that it is not affiliated with, endorsed or sponsored by the Japan Foundation or JEES, and that JLPT is their trademark. If you require it, we will change the app name to "루마 - 일본어 단어 간격 반복" and keep "JLPT" only in the description.

Have the fallback name ready (`listing-ko.md` §1); the home-screen name `CFBundleDisplayName` would then need a new build ("루마").

### 5.2.1 Third-party content: the word data

Reply:
> The word list comes from open-anki-jlpt-decks (MIT licence), based on the tanos.co.uk lists by Jonathan Waller. Frequency data is from wordfreq (CC BY-SA 4.0), dictionary data from JMdict and KANJIDIC2 (Electronic Dictionary Research and Development Group, CC BY-SA), Korean readings checked against Unicode Unihan (Unicode License v3). All are credited with links in Settings > 정보, and the derived data notice ships with the app (data/NOTICE.txt). The JLPT publishes no official vocabulary list and no exam content is included.

Open items before relying on this reply: the original tanos.co.uk licence wording and the intermediate repository's licence are unverified (01 §7, 06 §4.3); whether CC BY-SA extends to the Korean meanings is undecided (`public/data/NOTICE.txt`). 

### 2.1 App completeness

Common causes here: data failing to load on first launch, a dead button, a broken privacy policy or support URL, a crash on an older iOS. Reply only with specifics (which build, what was fixed). Before submitting:
- the privacy policy and support pages are live at the URLs entered in App Store Connect, with the operator blanks filled in (the privacy policy is reachable **inside the app**: Settings › 정보 › 개인정보 처리방침, offline, since 2026-11-14);
- the app was run on iOS 16.4 (the minimum) and a current iOS;
- the app was opened in Airplane Mode on first launch;
- no entry point for unfinished features is visible (the explanation and story features are hidden while `src/content.ts` reports them unavailable — keep it that way).

### 2.3.1 / 2.3 Accurate metadata: the readiness estimate

If a reviewer reads the estimate as a pass prediction:
> The number is an estimate of how many words of the chosen JLPT level lists the learner will remember on the exam morning, computed from their own review history with the FSRS memory model. The app never shows a pass probability, and the home card says so: vocabulary only, not grammar, reading or listening.

### 5.1.1(i) Privacy policy in the app

Guideline 5.1.1(i): "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner" (guidelines page, 2026-11-14). Done 2026-11-14: Settings › 정보 has "개인정보 처리방침" and "도움말 · 문의" rows; in the iOS app they open the bundled pages in place (works offline), on the web the published pages (`checklist.md` C3–C4). If a reviewer cannot find it:
> The privacy policy is in Settings (설정, the gear tab) > 정보 (About) > 개인정보 처리방침 (Privacy Policy). It opens inside the app, also offline; the same text is published at the privacy policy URL.

### 3.1.1 In-App Purchase (when 루마 플러스 arrives)

Not applicable to 1.0 (free, no purchases). For the Plus version:
- Sell Plus only through In-App Purchase as a non-consumable (`luma_plus_lifetime` in `server/README.md`); register the product and submit it with the build (2.1(b): every IAP must be visible and working).
- A **Restore Purchases** button on the paywall and in Settings (3.1.1: "make sure you have a restore mechanism for any restorable in-app purchases").
- No link, button or wording that points to buying outside the app (3.1.1(a); the Korean storefront has no exception).
- Turn the paid features on in the reviewed build, not remotely after approval (2.5.19).
- First use of the weak-word story: tell the user the chosen words are sent to an external AI service and ask for consent (5.1.2(i)); label the output as AI-generated.
- Update the App Privacy answers (`privacy-labels.md` §2) and publish Part 2 of the privacy policy before that version goes to review.
- Note for reviewers: "Ruma Plus is a one-time non-consumable purchase. Use the sandbox account to buy it on the paywall (Settings > 루마 플러스); Restore is on the same screen. Plus unlocks word explanations, the weak-word story (one a day) and detailed statistics; the full study loop for all levels stays free."
