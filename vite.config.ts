import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readdirSync, readFileSync, rmSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * public/data/n{1..5}.json are the frozen word files of the version before stable word ids (docs/plan/08 §7.6):
 * deployed on the web only so that a tab still running that version after an update can load its levels. This
 * version never reads them, so the service worker does not precache them and the iOS app does not bundle them.
 */
const LEGACY_DATA = /^n[1-5]\.json$/
const dropLegacyData = () => ({
  name: 'drop-legacy-word-data',
  apply: 'build' as const,
  closeBundle() {
    const dir = new URL('./dist-native/data/', import.meta.url)
    for (const f of readdirSync(dir)) if (LEGACY_DATA.test(f)) rmSync(new URL(f, dir))
  },
})

/**
 * The dev server answers every unknown path with the app's index.html; GitHub Pages (and `vite preview`) serve a
 * folder's index.html. So that `npm run dev` and the e2e tests open public/privacy/ and public/support/ (made by
 * scripts/build-pages.mjs) as the pages they are, a folder path there is served its index.html.
 */
const servePageFolders = () => ({
  name: 'serve-page-folders',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = (req.url ?? '').split('?')
      if (/\/(privacy|privacy\/en|support)\/$/.test(path)) req.url = `${path}index.html${query ? `?${query}` : ''}`
      next()
    })
  },
})

/**
 * Two builds from the same code (docs/plan/10-ios-build.md):
 * - `vite build` (web, GitHub Pages): PWA with a service worker, exactly as before; the native platform code
 *   is not in this bundle at all (`import.meta.env.MODE === 'native'` is false at build time, so the dynamic
 *   import of src/platform/native.ts is dropped).
 * - `vite build --mode native` (iOS app via Capacitor, output in dist-native/): no service worker — the
 *   assets and word data are bundled in the app and served from capacitor://localhost, where WKWebView does
 *   not run service workers anyway.
 */
export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  return {
    base: './',
    // written into backup files so a future app can tell which version made them
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: native ? { outDir: 'dist-native', emptyOutDir: true } : undefined,
    // a separate dependency cache, so a web and a native dev server can run side by side (the e2e tests do)
    cacheDir: native ? 'node_modules/.vite-native' : undefined,
    // the dev server in native mode (tests/e2e/native-shell.spec.ts) pre-bundles the lazily imported plugins up
    // front, so the first page load does not trigger a dependency re-optimisation and reload
    optimizeDeps: native
      ? {
          include: [
            '@capacitor/core',
            '@capacitor/app',
            '@capacitor/browser',
            '@capacitor/filesystem',
            '@capacitor/haptics',
            '@capacitor/local-notifications',
            '@capacitor/share',
            '@capacitor/status-bar',
            '@capacitor-community/text-to-speech',
            '@capawesome/capacitor-file-picker',
          ],
        }
      : undefined,
    plugins: [
      react(),
      servePageFolders(),
      ...(native
        ? [dropLegacyData()]
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icon.svg', 'apple-touch-icon.png'],
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,json}'],
                globIgnores: ['**/data/n[1-5].json'],
                maximumFileSizeToCacheInBytes: 3_000_000,
                // the privacy and support pages (public/privacy, public/support: scripts/build-pages.mjs) are pages of
                // their own: a navigation to them is never answered with the app's index.html (precached, so offline too)
                navigateFallbackDenylist: [/\/(privacy|support)(\/|$)/],
              },
              manifest: {
                name: 'JLPT 루마',
                short_name: 'JLPT 루마',
                description: '루마와 함께 잊기 전에 한 겹 더, 간격 반복 JLPT 단어장',
                lang: 'ko',
                display: 'standalone',
                orientation: 'portrait',
                background_color: '#fbfaf5',
                theme_color: '#fbfaf5',
                start_url: '.',
                icons: [
                  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
            }),
          ]),
    ],
  }
})
