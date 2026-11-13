import { defineConfig } from 'vitest/config'

// Unit tests only; the PWA/React plugins of vite.config.ts are not needed for pure logic.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
    // Day boundaries depend on the local time zone: pin it so results don't depend on the machine.
    env: { TZ: 'Asia/Seoul' },
  },
})
