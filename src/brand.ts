// The product's visible name. Storage keys keep the old internal name (`kasane.*`) so existing data is found.

export const BRAND = 'JLPT 루마'
/** Document title, as in index.html. */
export const TITLE = 'JLPT 루마 — 간격 반복 단어장'
/** Not an official app (02 §6, 06 §4.2): shown in settings › 정보 and in the readiness explanation. */
export const UNOFFICIAL_NOTICE =
  'JLPT 루마는 일본국제교류기금(JF)·일본국제교육지원협회(JEES)와 관계없는 비공식 학습 앱이며, 두 기관이 승인하거나 후원하지 않아요. JLPT(일본어능력시험)는 해당 기관의 상표예요.'

/** The same in one line, at the foot of Home while Ruma asks the first-run questions (where the onboarding page had it). */
export const UNOFFICIAL_SHORT = 'JLPT 주최 기관(JF·JEES)과 관계없는 비공식 학습 앱이에요.'

declare const __APP_VERSION__: string | undefined
/**
 * The app's version: `version` in package.json, the one source (vite.config.ts defines it at build time). Shown in
 * settings › 정보 and written into backup files. The iOS app's marketing version is the same number
 * (tests/unit/pages.test.ts checks the Xcode project; the TestFlight workflow reads package.json).
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
