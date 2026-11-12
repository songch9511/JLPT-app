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
  if (!hasKey()) throw new AiError('설정에서 Anthropic API 키를 먼저 입력해 주세요.')
}

export async function explainWord(w: Word): Promise<Explain> {
  requireKey()
  const out = await (await import('./ai-client')).explain(w)
  try {
    localStorage.setItem(cacheKey(w.id), JSON.stringify(out))
  } catch {
    /* cache is best-effort */
  }
  return out
}

export async function weakStory(words: Word[]): Promise<Story> {
  requireKey()
  return (await import('./ai-client')).story(words)
}
