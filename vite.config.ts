import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const mockApiPlugin = (): Plugin => ({
  name: 'navhub-mock-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const rawUrl = req.url || '';
      if (!rawUrl.startsWith('/api')) return next();

      const requestUrl = new URL(rawUrl, 'http://localhost');
      const pathname = requestUrl.pathname;
      const action = requestUrl.searchParams.get('action') ?? '';
      const method = (req.method ?? 'GET').toUpperCase();

      const sendJson = (statusCode: number, body: unknown) => {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(body));
      };

      // Sync API: for frontend-only dev, return an empty payload on GET /api/sync to avoid noisy errors.
      if (pathname === '/api/sync' && method === 'GET' && !action) {
        sendJson(200, { success: true, data: null });
        return;
      }

      // Auth check is often used for UI gating; return a deterministic "unavailable" response.
      if (pathname === '/api/sync' && method === 'GET' && action === 'auth') {
        sendJson(200, {
          success: false,
          error:
            'Sync API is unavailable in Vite dev. Use `npm run dev:workers` or `npm run dev:pages`.',
        });
        return;
      }

      // AI proxy is only available when deployed via Workers/Pages.
      if (pathname === '/api/ai') {
        sendJson(501, {
          success: false,
          error:
            'AI proxy is unavailable in Vite dev. Use `npm run dev:workers` or `npm run dev:pages`.',
        });
        return;
      }

      sendJson(501, {
        success: false,
        error:
          'API is unavailable in Vite dev. Set `VITE_MOCK_API=false` to disable the mock, or use `npm run dev:workers`/`npm run dev:pages`.',
      });
    });
  },
});

const isTruthyEnv = (value: string | undefined): boolean => {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim();
  // Default to enabling API mock for `npm run dev` (frontend-only).
  // Disable explicitly for local API integration by setting `VITE_MOCK_API=false`.
  const shouldMockApi =
    command === 'serve' &&
    (env.VITE_MOCK_API === undefined ? mode === 'development' : isTruthyEnv(env.VITE_MOCK_API));
  const proxy =
    command === 'serve' && apiProxyTarget && !shouldMockApi
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
      shouldMockApi && mockApiPlugin(),
      react(),
      tailwindcss(),
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
