const http = require('http')
const https = require('https')
const os = require('os')
const crypto = require('crypto')

const state = {
    lastSentAtByFingerprint: new Map(),
    warnedMissingWebhook: false,
}

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function parseNumber(value, fallback) {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? num : fallback
}

function isOpsAlertsEnabled() {
    return parseBoolean(
        process.env.OPS_ALERTS_ENABLED,
        process.env.NODE_ENV === 'production'
    )
}

function getWebhookUrl() {
    return String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim()
}

function getMinIntervalMs() {
    return parseNumber(process.env.OPS_ALERT_MIN_INTERVAL_SECONDS, 60) * 1000
}

function getTimeoutMs() {
    return parseNumber(process.env.OPS_ALERT_TIMEOUT_MS, 8000)
}

function truncate(value, maxLength = 1200) {
    const text = String(value || '')
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}...`
}

function normalizeErrorText(error) {
    if (!error) return ''
    if (error instanceof Error) {
        return truncate(error.stack || error.message || 'Unknown error')
    }
    if (typeof error === 'object') {
        try {
            return truncate(JSON.stringify(error))
        } catch (e) {
            return truncate(String(error))
        }
    }
    return truncate(String(error))
}

function buildFingerprint(level, message, metadata = {}) {
    const seed = [
        level || 'error',
        message || '',
        metadata.method || '',
        metadata.url || '',
        metadata.route || '',
    ].join('|')
    return crypto.createHash('sha1').update(seed).digest('hex')
}

function buildPayload(level, message, metadata = {}) {
    const envName = process.env.NODE_ENV || 'development'
    const host = os.hostname()
    const timestamp = new Date().toISOString()
    const compactMeta = {
        method: metadata.method || null,
        url: metadata.url || null,
        stack: metadata.stack ? truncate(metadata.stack, 2000) : null,
        error: metadata.error ? normalizeErrorText(metadata.error) : null,
    }

    const safeMessage = truncate(message || 'Unknown backend error', 600)
    const text = `[${envName}] [${level.toUpperCase()}] ${safeMessage}`

    return {
        app: 'smart-pos-backend',
        env: envName,
        host,
        level,
        message: safeMessage,
        timestamp,
        metadata: compactMeta,
        text,
    }
}

function postJson(urlString, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let parsed
        try {
            parsed = new URL(urlString)
        } catch (error) {
            reject(new Error(`Invalid OPS_ALERT_WEBHOOK_URL: ${error.message}`))
            return
        }

        const payload = JSON.stringify(body)
        const transport = parsed.protocol === 'https:' ? https : http
        const req = transport.request(
            {
                method: 'POST',
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
                timeout: timeoutMs,
            },
            (res) => {
                let raw = ''
                res.on('data', (chunk) => { raw += chunk })
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ statusCode: res.statusCode })
                        return
                    }
                    reject(
                        new Error(
                            `Webhook responded with ${res.statusCode}: ${truncate(raw, 600)}`
                        )
                    )
                })
            }
        )

        req.on('timeout', () => {
            req.destroy(new Error(`Webhook timeout after ${timeoutMs}ms`))
        })
        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

async function sendOpsAlert({ level = 'error', message, metadata = {} } = {}) {
    if (!isOpsAlertsEnabled()) {
        return { sent: false, reason: 'disabled' }
    }

    const webhookUrl = getWebhookUrl()
    if (!webhookUrl) {
        if (!state.warnedMissingWebhook) {
            state.warnedMissingWebhook = true
            console.error('OPS alerting enabled but OPS_ALERT_WEBHOOK_URL is empty.')
        }
        return { sent: false, reason: 'missing_webhook' }
    }

    const fingerprint = buildFingerprint(level, message, metadata)
    const now = Date.now()
    const minIntervalMs = getMinIntervalMs()
    const lastSentAt = state.lastSentAtByFingerprint.get(fingerprint) || 0
    if ((now - lastSentAt) < minIntervalMs) {
        return {
            sent: false,
            reason: 'throttled',
            retryAfterMs: minIntervalMs - (now - lastSentAt),
        }
    }

    const payload = buildPayload(level, message, metadata)
    await postJson(webhookUrl, payload, getTimeoutMs())
    state.lastSentAtByFingerprint.set(fingerprint, now)
    return { sent: true }
}

module.exports = {
    sendOpsAlert,
    isOpsAlertsEnabled,
}

