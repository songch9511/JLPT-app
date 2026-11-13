import type { Word } from './data'
import { getState } from './store'

// The SDK and schemas live in ./ai-client and load only when an AI feature is first used.

export interface Sentence {
  ja: string
  kana: string
  ko: string
}
export interface Explain {
  examples: Sentence[]
  kanji: string
  tip: string
  related: { word: string; kana: string; ko: string }[]
}
export interface Story {
  title: string
  lines: Sentence[]
}

export class AiError extends Error {}

/** The AI code could not be loaded: usually a new version was deployed while this page stayed open. */
export class StaleAppError extends AiError {
  constructor() {
    super('앱이 새 버전으로 바뀌었어요. 새로고침하면 AI 설명을 다시 쓸 수 있어요.')
  }
}

async function client() {
  try {
    return await import('./ai-client')
  } catch {
    // the old chunk is gone from the server after a deploy; only a reload fetches the new one
    throw new StaleAppError()
  }
}

export const hasKey = () => !!getState().settings.apiKey.trim()

const cacheKey = (id: string) => `kasane.ai.${id}`

export function cachedExplain(id: string): Explain | null {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    return raw ? (JSON.parse(raw) as Explain) : null
  } catch {
    return null
  }
}

function requireKey() {
  if (!hasKey()) throw new AiError('AI 설명은 설정에서 켤 수 있어요.')
}

export async function explainWord(w: Word): Promise<Explain> {
  requireKey()
  const out = await (await client()).explain(w)
  try {
    localStorage.setItem(cacheKey(w.id), JSON.stringify(out))
  } catch {
    /* cache is best-effort */
  }
  return out
}

export async function weakStory(words: Word[]): Promise<Story> {
  requireKey()
  return (await client()).story(words)
}
