import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const DEV_SYNC_DIAGNOSTIC_PATH = '/__internal/sync-diagnostic';
const DEV_SYNC_DIAGNOSTIC_SOURCE = path.resolve(__dirname, './devtools/sync-diagnostic.html');

function syncDiagnosticDevPlugin(): Plugin {
  return {
    name: 'navhub-sync-diagnostic-dev-only',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== DEV_SYNC_DIAGNOSTIC_PATH) {
          next();
          return;
        }

        try {
          const html = readFileSync(DEV_SYNC_DIAGNOSTIC_SOURCE, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
          res.end(html);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            error instanceof Error
              ? `Failed to load sync diagnostic tool: ${error.message}`
              : 'Failed to load sync diagnostic tool.',
          );
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim();
  const proxy =
    command === 'serve' && apiProxyTarget
      ? {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        }
      : undefined;
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy,
    },
    plugins: [
      react(),
      tailwindcss(),
      syncDiagnosticDevPlugin(),
      VitePWA({
        injectRegister: null,
        registerType: 'autoUpdate',
        includeAssets: ['pwa.svg', 'pwa-180x180.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'NavHub - AI Smart Navigator',
          short_name: 'NavHub',
          description: 'Minimal, private, intelligent AI navigation hub.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#05070f',
          background_color: '#05070f',
          icons: [
            {
              src: '/pwa.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                networkTimeoutSeconds: 3,
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
              options: {
                cacheName: 'api',
              },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // React core libraries (stable, rarely updated - good for long-term caching)
            'vendor-react': ['react', 'react-dom'],
            // Drag and drop libraries
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            // Icon library
            'vendor-icons': ['lucide-react'],
            // AI library
            'vendor-ai': ['@google/genai'],
          },
        },
      },
      // Increase chunk size warning limit to reduce warnings
      chunkSizeWarningLimit: 1000,
    },
  };
});
