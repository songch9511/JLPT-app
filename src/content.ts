// Seam for word content that is not in the word list itself. The approved plan has no API key in the
// product: per-word explanations will ship as pre-generated static data, and the weak-word story will come
// from a backend that is not deployed yet. Until then both sources say they are not available and the
// screens show no entry point for them.

export interface ExampleSentence {
  ja: string
  /** reading of the whole sentence in hiragana */
  kana: string
  ko: string
}

/** What the word sheet and the study card will show for one word. */
export interface WordExplanation {
  examples: ExampleSentence[]
  /** kanji breakdown with Korean readings */
  kanji: string
  /** memory tip for Korean speakers */
  tip: string
  related: { word: string; kana: string; ko: string }[]
}

/** A short story that uses the given weak words. */
export interface WordStory {
  title: string
  lines: ExampleSentence[]
}

export interface ExplanationSource {
  /** whether explanations can be asked for at all; screens hide their entry point when false */
  readonly available: boolean
  /** the explanation of one word (`<level>-<idx>`), or null when there is none for it */
  explanationFor(wordId: string): Promise<WordExplanation | null>
}

export interface StorySource {
  readonly available: boolean
  storyFor(wordIds: string[]): Promise<WordStory | null>
}

export class ContentUnavailableError extends Error {
  constructor() {
    super('아직 준비 중인 기능이에요.')
  }
}

/** Placeholders until the static explanation data and the story backend exist. */
export const explanations: ExplanationSource = {
  available: false,
  explanationFor: () => Promise.reject(new ContentUnavailableError()),
}

export const stories: StorySource = {
  available: false,
  storyFor: () => Promise.reject(new ContentUnavailableError()),
}
