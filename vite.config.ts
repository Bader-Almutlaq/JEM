import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Where the app is served from. GitHub Pages serves it under `/<repository>/`, so the deploy
 * workflow sets `BASE_PATH=/<repository>/`; local development uses `/`.
 */
const BASE_PATH = process.env['BASE_PATH'] ?? '/';

/** The SQLite WebAssembly file is about 0.9 MB; the default precache limit (2 MiB) is raised for headroom. */
const PRECACHE_LIMIT_BYTES = 5 * 1024 * 1024;

/** Heuristic: retain two frames for about 300 viewed exercises without unbounded picture storage. */
const PICTURE_CACHE_ENTRIES = 600;

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      // Never reload on its own: a new version waits until the owner taps "Update" (never mid-workout).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'JEM',
        short_name: 'JEM',
        description: 'Personal workout tracker.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        background_color: '#08090A',
        theme_color: '#08090A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs runs offline, including the database engine.
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,json}'],
        maximumFileSizeToCacheInBytes: PRECACHE_LIMIT_BYTES,
        // Heuristic: about 300 viewed exercises (two frames each), bounded to avoid unbounded storage.
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/cdn\.jsdelivr\.net\/gh\/everkinetic\/data@446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6\/dist\/png\/\d{4}-(relaxation|tension)\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-illustrations',
              expiration: { maxEntries: PICTURE_CACHE_ENTRIES },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern:
              /^https:\/\/cdn\.jsdelivr\.net\/gh\/yuhonas\/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5\/exercises\/[\w-]+\/[01]\.jpg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-pictures',
              expiration: { maxEntries: PICTURE_CACHE_ENTRIES },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        navigateFallback: `${BASE_PATH}index.html`,
      },
    }),
  ],
  worker: { format: 'es' },
  // The SQLite package loads its .wasm file relative to itself; pre-bundling would break that path.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  server: { port: 5173 },
});
