import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap';
import removeConsole from 'vite-plugin-remove-console';
import checker from 'vite-plugin-checker';

const baseUrl = process.env.VITE_BASE_URL || '/';
const hostname = process.env.VITE_HOSTNAME || 'https://www.fung.es';

const routeFullPaths = [
  '/data',
  '/impressum',
  '/instructions',
  '/offline',
  '/privacy-policy',
  '/recipes',
  '/settings',
  '/species',
  '/support',
  '/termsuse',
  '/worth-foraging-now',
];

// Cloudflare's Rocket Loader rewrites <script type="module"> into its own
// deferred loader, adding a round trip before any app code runs. data-cfasync
// opts out — and it has to be added here because Vite regenerates the entry
// script tag from scratch, dropping any attribute written in index.html.
const cfasyncOptOut = {
  name: 'cfasync-opt-out',
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html.replace(
        /<script type="module"/g,
        '<script type="module" data-cfasync="false"'
      ),
  },
};

// https://vite.dev/config/
export default defineConfig({
  base: baseUrl,
  plugins: [
    cfasyncOptOut,
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif}'],
        // HEIC support is a fallback, so do not make every visitor download its
        // decoder chunk. Cache the JS + WASM after the first HEIC photo instead.
        globIgnores: ['**/heic-decoder-*.js'],
        runtimeCaching: [
          // PMTiles use Range requests; SW can't cache 206 — NetworkOnly avoids ERR_CACHE_OPERATION_NOT_SUPPORTED. Keep first.
          {
            urlPattern: /\.pmtiles$/i,
            handler: 'NetworkOnly',
          },
          // onnxruntime-web runtime for photo identification. Emitted by Vite as
          // a content-hashed asset (~27MB), so it is deliberately NOT precached:
          // `.wasm` is absent from globPatterns above, and workbox's 2 MiB
          // precache ceiling would make the build THROW, not warn.
          //
          // A content hash in the filename means a new ORT version is a new URL,
          // so an effectively-permanent TTL cannot serve stale bytes.
          {
            urlPattern: /\/assets\/ort-wasm.*\.(?:wasm|mjs)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ort-runtime-cache',
              expiration: {
                maxEntries: 6,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/(?:heic-decoder|heic_dec).*\.(?:js|wasm)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'heic-decoder-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Precomputed BioCLIP text-embedding matrix (~1.6MB). Kept on runtime
          // caching rather than precache so adding `bin` to globPatterns cannot
          // later pull in some unrelated large binary and break the build.
          //
          // Matched under /assets/ because it is imported as a Vite asset and so
          // carries a content hash. That is what makes a year-long TTL safe: new
          // content is a new URL, so this cache cannot serve a matrix that
          // disagrees with the labels file it is index-aligned to.
          {
            urlPattern: /\/assets\/.*\.bin$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bioclip-labels-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // The bundled MatMulNBits probe (~40KB), used to decide which model
          // variant this device can run before committing to a ~280MB download.
          // It has to work offline, or an offline device could not open the
          // download gate at all.
          //
          // `[^/]+` is load-bearing: it matches /models/probe.onnx but NOT the R2
          // artifact at /models/bioclip/<version>/image_tower_int4.onnx. Without
          // it this rule would have the service worker cache a second 280MB copy
          // of a model that already lives in IndexedDB.
          {
            urlPattern: /\/models\/[^/]+\.onnx$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bioclip-probe-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Static assets caching
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // Fonts caching
          {
            urlPattern: /\.(?:woff|woff2|eot|ttf|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          // CSV data files - ensure downloads work when installed as PWA
          {
            urlPattern: /\/data\/.*\.csv$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
          // API calls - Network First with fallback
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 10,
            },
          },
          // Map style JSON — required to initialize the map. Cached on the
          // online visit so a downloaded region can still render the map offline.
          {
            urlPattern:
              /funges_style(_dark|_positron|_darkmatter|_topographic)?\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              // Bump when style source URLs change so a newly deployed service
              // worker cannot serve JSON that still points at a retired host.
              cacheName: 'map-style-cache-v2',
              expiration: {
                maxEntries: 6,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // Map glyphs + sprites (Protomaps basemap assets, cross-origin) so
          // labels/icons render offline for tiles that were viewed online.
          {
            urlPattern:
              /^https:\/\/protomaps\.github\.io\/basemaps-assets\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-fonts-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          // Data JSON (e.g. scores_metadata.json for the "last updated" label).
          {
            urlPattern: /\/data\/.*\.json$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-json-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
        ],
        // Offline fallback
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^(?!\/__).*/],
        navigateFallbackDenylist: [/\/data\/.*\.csv$/],
        // Skip waiting for immediate activation
        skipWaiting: true,
        clientsClaim: true,
        // Clean up old caches
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Funges - Wild Mushroom & Edible Plants Foraging Map',
        short_name: 'Funges',
        description:
          'Real-time map of wild mushrooms and edible plants using weather and geospatial data.',
        theme_color: '#3d7e40',
        background_color: '#ffffff',
        display: 'standalone',
        scope: baseUrl,
        start_url: baseUrl,
        icons: [
          {
            src: `icons/logo_app.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // opaque + padded: 'any maskable' on a transparent edge-to-edge logo
            // gets cropped into a bad adaptive launcher icon on Android
            src: `icons/logo_maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: `icons/logo_1.png`,
            sizes: '256x256',
            type: 'image/png',
            purpose: 'any',
          },
        ],
        // Add categories for better app store discovery
        categories: ['nature', 'education', 'food', 'travel'],
        // Add screenshots for app stores
        screenshots: [
          {
            src: `icons/logo_app.png`,
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Funges App Screenshot',
          },
        ],
        shortcuts: [
          {
            name: 'View Map',
            short_name: 'Map',
            description: 'Open the foraging map',
            url: ``,
            icons: [
              {
                src: `icons/logo_app.png`,
                sizes: '512x512',
              },
            ],
          },
          {
            name: 'Browse Species',
            short_name: 'Species',
            description: 'Browse mushroom and plant species',
            url: `species`,
            icons: [
              {
                src: `icons/logo_app.png`,
                sizes: '512x512',
              },
            ],
          },
          {
            name: 'Worth Foraging Now',
            short_name: 'Now',
            description:
              'See the best nearby foraging targets based on current signals',
            url: `worth-foraging-now`,
            icons: [
              {
                src: `icons/logo_app.png`,
                sizes: '512x512',
              },
            ],
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
    Sitemap({
      hostname: `${hostname}${baseUrl}`,
      dynamicRoutes: routeFullPaths,
    }),
    removeConsole({
      includes: [
        'log',
        'debug',
        'warn',
        'trace',
        'dir',
        'group',
        'groupCollapsed',
        'groupEnd',
        'table',
        'time',
        'timeEnd',
        'timeLog',
        'count',
        'countReset',
        'assert',
        'clear',
      ],
    }),
    checker({
      typescript: true,
      eslint: false,
      stylelint: false,
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@routes': '/src/routes',
      '@store': '/src/store',
      '@lib': '/src/lib',
      '@styles': '/src/styles',
      '@i18n': '/src/i18n',
      '@hooks': '/src/hooks',
      '@types': '/src/types',
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // SCSS preprocessing options can be added here if needed
      },
    },
  },
  // The BioCLIP inference worker imports onnxruntime-web, which needs real ESM
  // (it dynamically imports its own WASM glue). Vite's default worker format is
  // 'iife', where `import` is a syntax error — so this must match the
  // `{ type: 'module' }` at the `new Worker(...)` call site in
  // src/lib/bioclip/session.ts.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Both packages resolve sibling WASM files at runtime. Pre-bundling moves
    // their JS into `.vite/deps` without the WASM, making the request fall
    // through to index.html and fail compilation.
    exclude: ['onnxruntime-web', '@discourse/heic'],
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    // es2015 had esbuild downlevel async/await and class fields into generator
    // + helper code: 22 KB raw / 6 KB gzip of the entry chunk, for browsers
    // that could not run this app's WASM or service worker anyway.
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@discourse/heic')) {
            return 'heic-decoder';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
