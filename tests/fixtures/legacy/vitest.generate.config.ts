import { defineConfig } from 'vitest/config'

// Only for generate-at-5fd69b4.ts (see there); not part of the test suite.
export default defineConfig({
  test: { include: ['tests/fixtures/legacy/generate-at-5fd69b4.ts'], environment: 'node', env: { TZ: 'Asia/Seoul' }, testTimeout: 600_000 },
})
