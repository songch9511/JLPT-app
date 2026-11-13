// Every value the run depends on, in one place. Changing PROMPT_VERSION or SCHEMA_VERSION marks earlier
// outputs as generated under different instructions (they stay valid; `validate` reports them).

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '../../..')

export const SCHEMA_VERSION = 1
export const PROMPT_VERSION = 'explain-2026-11-13'

export const CONFIG = Object.freeze({
  // 01-business-model.md §4.4 and decision 4 chose Sonnet 5.5 via the Batch API for this job.
  // (The claude-api skill's general default is claude-opus-5-5; the business decision wins here.)
  model: process.env.EXPLAIN_MODEL || 'claude-sonnet-5-5',
  // Batches reject server-side `fallbacks`. Refused items are re-sent on this model instead
  // (for claude-sonnet-5-5 the documented fallback target is claude-sonnet-5).
  fallbackModel: process.env.EXPLAIN_FALLBACK_MODEL || 'claude-sonnet-5',
  // Adaptive thinking is on by default on Sonnet 5.5 and cannot be disabled with {type:'disabled'};
  // `low` effort keeps thinking short for this simple, well-specified task.
  effort: process.env.EXPLAIN_EFFORT || 'low',
  maxTokens: 4000,
  maxTokensCeiling: 16000, // a max_tokens stop is retried with double the budget, up to this
  // batches can run longer than 5 minutes; the batch docs recommend the 1-hour TTL. 'off' sends no cache_control.
  cacheTtl: process.env.EXPLAIN_CACHE || '1h',
  batchChunk: 2000, // requests per batch (API limit 100,000 / 256 MB); smaller batches = earlier partial results
  pollSeconds: 60,
  maxAttempts: 3, // per word id, across the first run and retries
})

// USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing (read 2026-11-13).
// Batch = 50% of every line below, and the batch discount stacks with the cache multipliers (same page).
export const PRICES = Object.freeze({
  checked: '2026-11-13',
  source: 'https://platform.claude.com/docs/en/about-claude/pricing',
  batchDiscount: 0.5,
  models: {
    'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, cacheRead: 0.1 },
    'claude-sonnet-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, cacheRead: 0.2 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, cacheRead: 0.01 },
    'claude-opus-5-5': { input: 4, output: 20, write5m: 5, write1h: 8, cacheRead: 0.2 },
  },
})

export const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1']

export function paths(root = REPO_ROOT) {
  const out = path.join(root, 'data/explain')
  return {
    root,
    publicData: path.join(root, 'public/data'),
    tags: path.join(root, 'data/tags'),
    kanji: path.join(root, 'data/hanja/kanji.tsv'),
    out,
    work: path.join(out, 'work'),
    state: path.join(out, 'work/state.json'),
    accepted: path.join(out, 'work/accepted'),
    failed: path.join(out, 'work/failed.json'),
    raw: path.join(out, 'work/raw'),
    usage: path.join(out, 'work/usage.json'),
    tokenCount: path.join(out, 'work/token-count.json'),
    preview: path.join(out, 'work/requests-preview.jsonl'),
    review: path.join(out, 'review'),
    dist: path.join(out, 'dist'),
  }
}
