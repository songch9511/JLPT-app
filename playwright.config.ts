import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4273)
/** The same app built for the iOS shell (`--mode native`), driven with a fake Capacitor bridge (native-shell.spec.ts). */
export const NATIVE_PORT = PORT + 1

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 1 : 3,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // a phone in portrait, like the app's users
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'off',
    serviceWorkers: 'block',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite --mode native --port ${NATIVE_PORT} --strictPort`,
      url: `http://localhost:${NATIVE_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
