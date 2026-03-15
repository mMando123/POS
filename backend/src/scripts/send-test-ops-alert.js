/**
 * Send OPS alert test and store evidence report.
 *
 * Run:
 *   node src/scripts/send-test-ops-alert.js
 *   node src/scripts/send-test-ops-alert.js --mock-webhook
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { sendOpsAlert, isOpsAlertsEnabled } = require('../services/opsAlertService')

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function hasFlag(flag) {
    return process.argv.includes(flag)
}

async function withMockWebhook(callback) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            let body = ''
            req.on('data', (chunk) => { body += chunk.toString() })
            req.on('end', () => {
                res.statusCode = 200
                res.end('ok')
            })
        })

        server.listen(9988, async () => {
            try {
                const result = await callback()
                server.close(() => resolve(result))
            } catch (error) {
                server.close(() => reject(error))
            }
        })
    })
}

async function main() {
    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
    }

    const useMockWebhook = hasFlag('--mock-webhook')
    const originalEnabled = process.env.OPS_ALERTS_ENABLED
    const originalUrl = process.env.OPS_ALERT_WEBHOOK_URL

    if (useMockWebhook) {
        process.env.OPS_ALERTS_ENABLED = 'true'
        process.env.OPS_ALERT_WEBHOOK_URL = 'http://127.0.0.1:9988/ops-alert'
        process.env.OPS_ALERT_MIN_INTERVAL_SECONDS = '1'
    }

    const runTest = async () => {
        const result = await sendOpsAlert({
            level: 'error',
            message: 'OPS test alert from Zimam System backend',
            metadata: {
                method: 'SYSTEM',
                url: '/ops/test-alert',
                stack: 'Synthetic alert for monitoring verification',
            },
        })

        const report = {
            createdAt: new Date().toISOString(),
            mockWebhook: useMockWebhook,
            alertsEnabled: isOpsAlertsEnabled(),
            webhookConfigured: !!String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim(),
            result,
            ok: !!result.sent,
        }
        const reportPath = path.join(reportsDir, `ops-alert-test-report-${ts()}.json`)
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

        console.log('OPS alerts enabled:', report.alertsEnabled)
        console.log('Webhook configured:', report.webhookConfigured)
        console.log('Result:', result)
        console.log('Report:', reportPath)

        if (!report.ok) {
            process.exitCode = 1
        }
    }

    try {
        if (useMockWebhook) {
            await withMockWebhook(runTest)
        } else {
            await runTest()
        }
    } finally {
        if (useMockWebhook) {
            process.env.OPS_ALERTS_ENABLED = originalEnabled
            process.env.OPS_ALERT_WEBHOOK_URL = originalUrl
        }
    }
}

main().catch((error) => {
    console.error('Failed to send test alert:', error.message)
    process.exit(1)
})


