// Re-checks every accepted output against the CURRENT word list and tags (both are still changing),
// plus the cross-word checks that need all outputs at once.

import { PROMPT_VERSION } from './config.mjs'
import { crossCheck, validate } from './validate.mjs'

/**
 * @param {Record<string, any>} accepted
 * @param {Map<string, import('./words.mjs').Word>} wordsById
 * @param {{ stalePrompt?: boolean }} [opt] also fail outputs made under an older PROMPT_VERSION
 * @returns {{ ok: Record<string, any>, failures: Map<string, {status: string, errors: any[]}>, warnings: Map<string, any[]> }}
 */
export function revalidate(accepted, wordsById, { stalePrompt = false } = {}) {
  const failures = new Map()
  const warnings = new Map()
  const fail = (id, e) => {
    if (!failures.has(id)) failures.set(id, { status: 'invalid', errors: [] })
    failures.get(id).errors.push(e)
  }
  const outputs = new Map()
  for (const [id, item] of Object.entries(accepted)) {
    const w = wordsById.get(id)
    if (!w) {
      fail(id, { code: 'word-removed', field: 'root' })
      continue
    }
    const snap = item.meta?.word
    if (snap && (snap.w !== w.w || snap.r !== w.r)) fail(id, { code: 'word-changed', field: 'root', msg: `${snap.w}(${snap.r}) → ${w.w}(${w.r})` })
    const tag = item.meta?.tag
    if (tag && w.tag.src === 'label' && tag.k !== w.tag.k) fail(id, { code: 'tag-changed', field: 'root', msg: `${tag.k || '?'}(${tag.src}) → ${w.tag.k}` })
    if (stalePrompt && item.meta?.promptVersion !== PROMPT_VERSION) fail(id, { code: 'prompt-changed', field: 'root', msg: String(item.meta?.promptVersion) })
    const v = validate(item.output, w)
    for (const e of v.errors) fail(id, e)
    if (v.warnings.length) warnings.set(id, v.warnings)
    outputs.set(id, item.output)
  }
  for (const [id, r] of crossCheck(outputs)) {
    for (const e of r.errors) fail(id, e)
    if (r.warnings.length) warnings.set(id, [...(warnings.get(id) || []), ...r.warnings])
  }
  const ok = {}
  for (const [id, item] of Object.entries(accepted)) if (!failures.has(id)) ok[id] = { ...item, warnings: warnings.get(id) || [] }
  return { ok, failures, warnings }
}
