// Word pictures (docs/design-system.md §3 "학습 카드" › 그림): at most one illustration per word, a 16:9 WebP at
// public/img/words/<word id>.webp. Which words have one is decided at build time only: scripts/build-data.mjs scans
// the folder and writes the ids into src/generated/content.ts. A file is fetched when a card or sheet that may show
// it appears (StudyCard.tsx usePicture), whether or not it is shown yet (설정 › 단어 그림); the web's service worker
// does not precache them (vite.config.ts), the iOS app bundles them with the rest of public/.
import { WORD_PICTURES } from './generated/content.ts'

export { WORD_PICTURES }

const HAS = new Set(WORD_PICTURES)

/** Whether a word (by its stable id) has a picture. Kanji cards (`k…`) never do. */
export const hasPicture = (id: string) => HAS.has(id)

/** The picture's file, relative to the app like the data files. */
export const pictureUrl = (id: string) => `${import.meta.env.BASE_URL}img/words/${id}.webp`
