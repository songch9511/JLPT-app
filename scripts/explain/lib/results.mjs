// Turns one batch result line (or a synchronous response wrapped in the same shape) into an outcome for one
// word. Results arrive in any order; everything is keyed by custom_id, never by position.

import { fromCustomId } from './requests.mjs'
import { validate } from './validate.mjs'

/**
 * @param {{custom_id: string, result: any}} line   one entry of client.messages.batches.results()
 * @param {Map<string, import('./words.mjs').Word>} wordsById
 * @returns {{ id: string|null, status: string, retryable: boolean, output?: any, errors?: any[], warnings?: any[],
 *   usage?: any, model?: string, detail?: string }}
 */
export function classify(line, wordsById) {
  const id = fromCustomId(line?.custom_id)
  if (!id || !wordsById.has(id)) return { id, status: 'unknown-id', retryable: false, detail: String(line?.custom_id) }
  const r = line.result || {}
  switch (r.type) {
    case 'succeeded': {
      const m = r.message || {}
      const base = { id, usage: m.usage, model: m.model }
      // Check stop_reason before reading content: a refusal or a cut-off output may not match the schema.
      if (m.stop_reason === 'refusal') {
        const cat = m.stop_details?.category ?? null
        return { ...base, status: 'refusal', retryable: true, detail: cat ? `category=${cat}` : 'refusal' }
      }
      if (m.stop_reason === 'max_tokens') return { ...base, status: 'max_tokens', retryable: true, detail: 'output cut off at max_tokens' }
      const text = (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
      let output
      try {
        output = JSON.parse(text)
      } catch (e) {
        return { ...base, status: 'invalid_json', retryable: true, detail: e.message }
      }
      const v = validate(output, wordsById.get(id))
      if (v.errors.length) return { ...base, status: 'invalid', retryable: true, output, errors: v.errors, warnings: v.warnings }
      return { ...base, status: 'ok', retryable: false, output, warnings: v.warnings }
    }
    case 'errored': {
      const type = r.error?.error?.type || r.error?.type || 'unknown_error'
      // invalid_request_error means our request is wrong: retrying the same params will fail the same way.
      return { id, status: 'errored', retryable: type !== 'invalid_request_error', detail: type }
    }
    case 'expired':
      return { id, status: 'expired', retryable: true, detail: 'batch reached 24h before this request ran' }
    case 'canceled':
      return { id, status: 'canceled', retryable: true }
    default:
      return { id, status: 'unknown-result', retryable: true, detail: String(r.type) }
  }
}

/** Short human-readable reason list for the retry file. */
export function reasons(outcome) {
  if (outcome.errors?.length) return outcome.errors.map((e) => `${e.code}@${e.field}${e.msg ? ` (${e.msg})` : ''}`)
  return [outcome.detail ? `${outcome.status}: ${outcome.detail}` : outcome.status]
}
