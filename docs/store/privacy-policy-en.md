# JLPT Ruma Privacy Policy (draft)

> **Before publishing (do not publish this box)**
> - Needs legal review, the same points as the Korean version (`privacy-policy-ko.md`). The Korean text is the primary version for Korean users; this English text is a translation for App Review and non-Korean readers. If the two differ, say which prevails.
> - `[brackets]` are for the operator to fill in.
> - Part 1 is the app as it is today. **Publish Part 1 only.** Part 2 describes what changes when 루마 플러스 (Ruma Plus) and the server launch; merge it into Part 1 only when those features ship.
> - The published page is generated from this file: `npm run pages` (`scripts/build-pages.mjs`) writes `public/privacy/en/index.html` without this box and without Part 2. Run it again after every change (a unit test checks).
> - The code checks behind each statement are listed in `docs/store/privacy-labels.md`, section 5.

Effective date: [YYYY-MM-DD]
Operator: [legal name of the individual developer or business] ("we")

JLPT 루마 ("JLPT Ruma", "the app") is built not to collect personal data. This policy explains what the app keeps, where, and what it does not do.

---

## Part 1. Current version (iOS app 1.x and the web version)

### 1. Summary

- There is no account and no sign-in.
- **We do not collect personal data.** Your study records and settings are stored only on your device and are not sent to us or anyone else.
- The app contains no analytics, no advertising, no tracking, no third-party login and no payments.
- The iOS app bundles everything it needs, including the word data, and does not connect to the internet while you study.

### 2. Data the app keeps on your device

We process **no** personal data. To work, the app creates and stores the following **only on your device**. It is never transmitted to us, so we cannot see it or identify you.

| Kept on the device | Used for | Where |
| --- | --- | --- |
| Study records: review schedule and memory state per word, daily study counts, bookmarks, XP | scheduling reviews, the counts on Home and the records screen | the app's own storage (web view storage and a file in the app's private folder) |
| Settings: target level, new words per day, theme, voice settings | your study plan | same |
| Reminder settings and scheduled reminders | review reminders | same; scheduled notifications sit in iOS Notification Center |
| A summary for the widget (reviews and new words for the next 7 days, words met so far) | the Home Screen widget | a shared container only this app and its widget can read (App Group) |
| Date of your last backup | the backup reminder | the app's own storage |

### 3. What happens on your device

- **Review reminders** are iOS local notifications, scheduled on the device only if you turn them on. Their text is composed on the device; no server is involved. You can turn notification permission off in iOS Settings at any time.
- **Pronunciation** uses the speech synthesis built into iOS (AVSpeechSynthesizer); words to be spoken do not leave the device. The web version uses your browser's speech synthesis; depending on the browser, an online voice may be used, in which case the word may be sent to the browser vendor under its own policy.
- **Haptics** use the device's haptic engine only.
- **Backup files** are created only when you tap Settings › Data › "백업 내보내기" (export backup). The app writes your records to a JSON file and opens the iOS share sheet; you decide where it goes (Files, AirDrop, mail…). We never receive it. Import reads only the file you pick in the document picker.
- **iOS device backups**: the study record file in the app's private folder may be included in the iCloud or computer backup that iOS makes. That backup is managed by you under your Apple Account; we have no access to it.

### 4. Retention and deletion

We hold no personal data, so there is nothing for us to retain or delete. You can delete the on-device data yourself:
- Settings › Data › "모든 기록 초기화" (reset all records) deletes study records, settings, scheduled reminders and widget data. This cannot be undone.
- Deleting the app deletes its on-device data (backup files you exported and iOS device backups remain).

### 5–7. Sharing, processors, international transfer

None.

### 8. Your rights

You have the right to access, correct, delete and restrict processing of your personal data. As we store none, you can view, change and delete everything in the app itself (section 4). For anything else, contact us (section 11).

### 9. Security

The app is designed not to send data to any server of ours and contains no analytics, advertising or tracking code. Study records stay inside the iOS app sandbox; the widget summary is in an App Group container readable only by this app and its widget. Backup files are plain, unencrypted text; they contain only study records, but keep that in mind before sharing one.

### 10. Cookies and identifiers

The app uses no cookies, no advertising identifier (IDFA) and no device identifier for analytics. The web version (`https://songch9511.github.io/JLPT-app/`) is served by GitHub Pages; when you open it, your browser connects to GitHub, which may process connection data such as your IP address under GitHub's own privacy statement. We do not receive those logs.

### 11. Contact

Privacy officer: [name] — [email address]. You may also contact the Korean Personal Information Infringement Report Center (privacy.kisa.or.kr, 118) or the Personal Information Dispute Mediation Committee (www.kopico.go.kr). [Verify these contacts before publishing.]

### 12. Children

The app does not ask for age and collects no personal data, including from children under 14.

### 13. External links

Settings › 정보 (About) links to the sources and licences of the word data (GitHub, EDRDG, Unicode, Creative Commons). They open in an in-app Safari view and follow those sites' own policies.

### 14. Changes

We will post changes on this page 7 days before they take effect. If a new feature starts processing personal data, the updated policy will be published before that app version is released, and the app will tell you.

---

## Part 2. When Ruma Plus and the server launch (not published yet)

> Basis: `docs/plan/01-business-model.md` §5.4, `docs/plan/07-security-operations.md` B-5/B-6, `server/README.md` (2026-11-13). The server code exists but is **not deployed**, and the app has no purchase or server code yet. Re-check the shipped implementation before publishing.

**Summary changes to:** Study records still stay on your device. If you buy Ruma Plus or use the weak-word story, the minimum needed to confirm the purchase and write the story is processed as below. If you don't use Ruma Plus, Part 1 applies unchanged.

| Purpose | Data | Retention |
| --- | --- | --- |
| Confirming and restoring the Ruma Plus purchase | an anonymous app user ID created per install (RevenueCat app user ID); App Store transaction data (product, purchase/refund status, transaction ID). No name, email or payment details — Apple handles payment | our server: a keyed hash of the ID and the entitlement state, while the service runs; RevenueCat: [per RevenueCat's policy] |
| Writing a weak-word story | the anonymous ID (to authenticate the request) and the **list of word IDs** to use (up to 12). Never the full study record, never free text | word IDs and the story are **not stored**; the daily usage count is kept 35 days |
| Abuse prevention and cost limits | hashed ID, daily usage count, IP address for per-minute rate limiting (not stored) | 35 days / minutes |
| Operating logs | path, status, latency, error code, first 8 characters of the hash, token counts — no words or story text | [Cloudflare log retention] |

**Recipients (processors or third parties — legal review):**

| Recipient | Purpose | Data | Country |
| --- | --- | --- | --- |
| RevenueCat, Inc. | in-app purchase validation and entitlements | anonymous ID, transaction data, app/device info sent by the SDK [confirm in RevenueCat docs] | USA |
| Cloudflare, Inc. | hosting our API (Cloudflare Workers, D1, KV) | the server data above | USA and Cloudflare data centres |
| Anthropic, PBC | generating the story text (AI) | written form, reading, meaning and level of the chosen words, plus part of the hashed ID for abuse detection. **No user ID, study record or IP address** | USA |

The first time you use the story, the app will say that the word list is sent to an external AI service and ask for your consent (App Review Guideline 5.1.2(i)), and label the result as AI-generated. You can decline by not using the story or not buying Ruma Plus; all study features keep working. No advertising identifier is used and no tracking permission is requested. To have server records about you deleted, send us the purchase ID shown in the app [feature to be built]; purchase records themselves are kept by Apple and RevenueCat.
