import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations') // relative to server/ (npm scripts run here)
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Test-only values. Real secrets are set with `wrangler secret put` (README).
          bindings: {
            TEST_MIGRATIONS: migrations,
            ANTHROPIC_API_KEY: 'test-anthropic-key',
            REVENUECAT_SECRET_KEY: 'test-revenuecat-key',
            REVENUECAT_WEBHOOK_AUTH: 'Bearer test-webhook-secret',
            USER_ID_PEPPER: 'test-pepper-0123456789abcdef',
            ALLOWED_ORIGINS: 'capacitor://localhost,https://app.example',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  }
})
