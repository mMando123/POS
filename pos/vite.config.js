import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
    const enablePwaInDev = mode === 'pwa-dev' || process.env.VITE_PWA_DEV === 'true'

    return {
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: [
                'icon.svg',
                'icon-192.png',
                'icon-512.png',
                'icon-maskable.png'
            ],
            manifest: {
                id: '/pos/',
                name: 'نظام نقاط البيع - المطعم',
                short_name: 'نقاط البيع',
                description: 'نظام إدارة نقاط البيع والطلبات للمطعم',
                theme_color: '#1565C0',
                background_color: '#0D47A1',
                display: 'standalone',
                orientation: 'any',
                start_url: '/',
                scope: '/',
                dir: 'rtl',
                lang: 'ar',
                categories: ['business', 'food'],
                icons: [
                    {
                        src: '/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: '/icon-maskable.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                // ——— Static assets: Cache First ———
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB — large bundle

                runtimeCaching: [
                    // Google Fonts — Cache First (rarely change)
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    // API calls — Network First (live data priority)
                    {
                        urlPattern: /\/api\/.*/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 5 // 5 minutes
                            },
                            cacheableResponse: { statuses: [0, 200] },
                            networkTimeoutSeconds: 10
                        }
                    },
                    // Uploaded images — Stale While Revalidate
                    {
                        urlPattern: /\/uploads\/.*/i,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'uploads-cache',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    }
                ],

                // Offline fallback page
                navigateFallback: '/index.html',
                navigateFallbackAllowlist: [/^(?!\/__).*/],

                // Clean old caches
                cleanupOutdatedCaches: true,

                // Activate new SW immediately to avoid stale UI after deploy
                skipWaiting: true,
                clientsClaim: true
            },

            devOptions: {
                // Enable SW in dev only for explicit PWA testing mode.
                enabled: enablePwaInDev
            }
        })
    ],
    server: {
        host: true,
        port: 3002,
        strictPort: true,
        allowedHosts: [
            'localhost',
            '127.0.0.1',
            '.ngrok-free.app',
            '.ngrok.app',
            '.ngrok.io'
        ],
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://localhost:3001',
                ws: true
            },
            '/uploads': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
}
})
