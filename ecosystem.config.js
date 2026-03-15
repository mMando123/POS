module.exports = {
    apps: [
        {
            name: 'smart-pos-backend',
            script: './backend/src/server.js',
            instances: 'max', // Or specific number
            exec_mode: 'cluster',
            autorestart: true,
            watch: false, // Don't watch in production
            max_memory_restart: '1G',
            env_staging: {
                NODE_ENV: 'staging',
                PORT: 3001,
                ACCOUNTING_STRICT_DEFAULTS: 'true',
                ACCOUNTING_AUTO_REMAP_POSTING: 'false',
                ACCOUNTING_ALLOW_GLOBAL_FALLBACK: 'false',
                OPS_ALERTS_ENABLED: 'true',
                OPS_ALERT_WEBHOOK_URL: process.env.OPS_ALERT_WEBHOOK_URL || '',
                OPS_ALERT_MIN_INTERVAL_SECONDS: '60',
                OPS_ALERT_TIMEOUT_MS: '8000',
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3001,
                ACCOUNTING_STRICT_DEFAULTS: 'true',
                ACCOUNTING_AUTO_REMAP_POSTING: 'false',
                ACCOUNTING_ALLOW_GLOBAL_FALLBACK: 'false',
                OPS_ALERTS_ENABLED: 'true',
                OPS_ALERT_WEBHOOK_URL: process.env.OPS_ALERT_WEBHOOK_URL || '',
                OPS_ALERT_MIN_INTERVAL_SECONDS: '60',
                OPS_ALERT_TIMEOUT_MS: '8000',
            }
        },
        {
            name: 'smart-pos-frontend',
            script: 'serve',
            env: {
                PM2_SERVE_PATH: './pos/dist', // Build output
                PM2_SERVE_PORT: 3000,
                PM2_SERVE_SPA: 'true',
                PM2_SERVE_HOMEPAGE: '/index.html'
            }
        }
    ]
};
