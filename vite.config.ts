import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      manifest: {
        name: '카사네 — JLPT 단어장',
        short_name: '카사네',
        description: '잊기 전에 한 겹 더, 간격 반복 JLPT 단어장',
        lang: 'ko',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f3ec',
        theme_color: '#f6f3ec',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
