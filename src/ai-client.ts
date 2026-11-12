import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AiError } from './ai'
import { meaning, type Word } from './data'
import { getState } from './store'

const MODEL = 'claude-opus-5-5'

const Explain = z.object({
  examples: z
    .array(
      z.object({
        ja: z.string().describe('자연스러운 일본어 예문 (JLPT 해당 급수 수준)'),
        kana: z.string().describe('예문 전체의 히라가나 읽기'),
        ko: z.string().describe('한국어 번역'),
      }),
    )
    .describe('예문 2개'),
  kanji: z.string().describe('한자별 음·훈과 한국 한자음/뜻 풀이. 한자가 없으면 어원이나 표기 설명. 2문장 이내'),
  tip: z.string().describe('한국어 화자에게 통하는 암기 팁 (한국 한자어와의 연결, 헷갈리는 단어와의 차이 등). 2문장 이내'),
  related: z
    .array(z.object({ word: z.string(), kana: z.string(), ko: z.string() }))
    .describe('함께 외우면 좋은 단어 2~3개 (유의어·반의어·같은 한자)'),
})

const Story = z.object({
  title: z.string().describe('한국어 제목'),
  lines: z
    .array(z.object({ ja: z.string(), kana: z.string().describe('문장 전체의 히라가나 읽기'), ko: z.string() }))
    .describe('4~6문장의 짧은 이야기'),
})

async function ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
  const apiKey = getState().settings.apiKey.trim()
  if (!apiKey) throw new AiError('설정에서 Anthropic API 키를 먼저 입력해 주세요.')
  // Loaded on demand so the SDK never weighs on app start.
  const [{ default: Client }, { betaZodOutputFormat }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/beta/zod'),
  ])
  // Personal app: the key lives only in this browser and goes straight to the API.
  const client: Anthropic = new Client({ apiKey, dangerouslyAllowBrowser: true })
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    })
    if (res.stop_reason === 'refusal') throw new AiError('AI가 이 요청에는 답하지 않았어요.')
    if (!res.parsed_output) throw new AiError('AI 응답을 해석하지 못했어요. 다시 시도해 주세요.')
    return res.parsed_output
  } catch (e) {
    if (e instanceof AiError) throw e
    if (e instanceof Client.AuthenticationError) throw new AiError('API 키가 올바르지 않아요. 설정에서 확인해 주세요.')
    if (e instanceof Client.RateLimitError) throw new AiError('요청이 많아요. 잠시 후 다시 시도해 주세요.')
    if (e instanceof Client.APIConnectionError) throw new AiError('네트워크에 연결할 수 없어요.')
    if (e instanceof Client.APIError) throw new AiError(`AI 요청에 실패했어요 (${e.status ?? '오류'}).`)
    throw e
  }
}

const SYSTEM =
  '당신은 한국인 학습자의 JLPT 준비를 돕는 일본어 선생님입니다. 설명은 한국어로, 짧고 정확하게 씁니다. ' +
  '예문은 해당 급수 학습자가 읽을 수 있는 쉬운 어휘와 문법으로 만듭니다.'

export function explain(w: Word) {
  return ask(
    Explain,
    SYSTEM,
    `JLPT N${w.level} 단어를 설명해 주세요.\n단어: ${w.w}\n읽기: ${w.r || w.w}\n뜻: ${meaning(w)}`,
  )
}

export function story(words: Word[]) {
  const list = words.map((w) => `${w.w}(${w.r || w.w}): ${meaning(w)}`).join('\n')
  return ask(
    Story,
    SYSTEM,
    `제가 자꾸 틀리는 단어들입니다. 이 단어들을 최대한 많이 사용해서 기억에 남는 짧은 이야기를 써 주세요. ` +
      `단어는 목록의 표기 그대로 문장에 넣어 주세요.\n\n${list}`,
  )
}
