// Builds one Messages API request per word. The same params go to the Batch API and to the synchronous
// sample path, so the sample is representative of the full run.

import { CONFIG } from './config.mjs'
import { OUTPUT_SCHEMA } from './schema.mjs'
import { SYSTEM, userMessage } from './prompt.mjs'
import { WORD_ID } from './words.mjs'

const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/ // Batch API constraint on custom_id
/** A stable word id (`w0k3`) is already a valid custom_id; keep it verbatim so results map back without a table. */
export function toCustomId(wordId) {
  if (!WORD_ID.test(wordId)) throw new Error(`bad word id: ${wordId}`)
  if (!CUSTOM_ID.test(wordId)) throw new Error(`id not usable as custom_id: ${wordId}`)
  return wordId
}

export function fromCustomId(customId) {
  if (typeof customId !== 'string' || !WORD_ID.test(customId)) return null
  return customId
}

/**
 * @param {import('./words.mjs').Word} word
 * @param {{ model?: string, maxTokens?: number, effort?: string, cacheTtl?: '5m'|'1h'|'off' }} [opt]
 */
export function buildParams(word, opt = {}) {
  const model = opt.model || CONFIG.model
  const ttl = opt.cacheTtl || CONFIG.cacheTtl
  return {
    model,
    max_tokens: opt.maxTokens || CONFIG.maxTokens,
    // Stable prefix first: system prompt + output schema are byte-identical for every word.
    system: [{ type: 'text', text: SYSTEM, ...(ttl === 'off' ? {} : { cache_control: { type: 'ephemeral', ttl } }) }],
    messages: [{ role: 'user', content: userMessage(word) }],
    // thinking is omitted: adaptive on Sonnet 5.5 / Sonnet 5 (`disabled` is a 400 on Sonnet 5.5).
    output_config: { effort: opt.effort || CONFIG.effort, format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
  }
}

export function buildRequest(word, opt) {
  return { custom_id: toCustomId(word.id), params: buildParams(word, opt) }
}

/**
 * Params for a retry, chosen by why the previous attempt failed:
 *   refusal    → the fallback model (re-sending a refusal to the same model usually refuses again)
 *   max_tokens → double the token budget, up to the ceiling
 *   anything else (validation, invalid JSON, errored, expired) → same params
 */
export function retryOptions(failure, cfg = CONFIG) {
  const prevMax = failure.maxTokens || cfg.maxTokens
  if (failure.status === 'refusal') return { model: cfg.fallbackModel, maxTokens: prevMax }
  if (failure.status === 'max_tokens') return { model: failure.model || cfg.model, maxTokens: Math.min(prevMax * 2, cfg.maxTokensCeiling) }
  return { model: failure.model || cfg.model, maxTokens: prevMax }
}
