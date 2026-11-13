import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, vi } from 'vitest'

// Every test starts from empty D1 and KV with the schema applied. Request logs are captured
// (tests assert on them) instead of being printed.
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

afterEach(() => {
  vi.restoreAllMocks()
})
