/**
 * Soak test for production readiness (POS + API + DB).
 *
 * Run:
 *   node src/scripts/stability-soak-test.js --hours=24 --interval=60
 *   node src/scripts/stability-soak-test.js --hours=0.1 --interval=15
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const jwt = require('jsonwebtoken')
const { Sequelize, QueryTypes } = require('sequelize')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { User, sequelize: appSequelize } = require('../models')
const { sendOpsAlert } = require('../services/opsAlertService')

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function nowIso() {
    return new Date().toISOString()
}

function getArg(name, fallback = null) {
    const match = process.argv.find((arg) => arg.startsWith(`${name}=`))
    if (!match) return fallback
    return match.slice(name.length + 1)
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncate(value, maxLength = 350) {
    const text = String(value || '')
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

async function httpGet(url, headers = {}, timeoutMs = 8000) {
    const start = Date.now()
    return new Promise((resolve) => {
        let parsed
        try {
            parsed = new URL(url)
        } catch (error) {
            resolve({ ok: false, latencyMs: 0, status: 0, error: error.message })
            return
        }

        const transport = parsed.protocol === 'https:' ? https : http
        const req = transport.request(
            {
                method: 'GET',
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                headers,
                timeout: timeoutMs,
            },
            (res) => {
                let body = ''
                res.on('data', (chunk) => { body += chunk.toString() })
                res.on('end', () => {
                    const latencyMs = Date.now() - start
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        latencyMs,
                        status: res.statusCode || 0,
                        body,
                    })
                })
            }
        )
        req.on('timeout', () => req.destroy(new Error(`timeout ${timeoutMs}ms`)))
        req.on('error', (error) => {
            resolve({
                ok: false,
                latencyMs: Date.now() - start,
                status: 0,
                error: error.message,
            })
        })
        req.end()
    })
}

async function getAdminToken() {
    const admin = await User.findOne({
        where: { role: 'admin', is_active: true },
        order: [['created_at', 'ASC']],
    })
    if (!admin || !process.env.JWT_SECRET) return null
    return jwt.sign(
        { userId: admin.id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    )
}

async function dbPing() {
    const dbDialect = String(process.env.DB_DIALECT || 'sqlite').toLowerCase()
    if (dbDialect !== 'mysql') {
        return { ok: true, note: `DB ping skipped for dialect=${dbDialect}` }
    }

    const sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 3306),
            dialect: 'mysql',
            logging: false,
        }
    )

    const start = Date.now()
    try {
        const rows = await sequelize.query('SELECT 1 AS ok', { type: QueryTypes.SELECT })
        return {
            ok: !!rows?.[0]?.ok,
            latencyMs: Date.now() - start,
        }
    } catch (error) {
        return {
            ok: false,
            latencyMs: Date.now() - start,
            error: error.message,
        }
    } finally {
        await sequelize.close().catch(() => {})
    }
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
    }
}

async function main() {
    const hours = Number(getArg('--hours', '24'))
    const intervalSeconds = Number(getArg('--interval', '60'))
    const posUrl = getArg('--pos-url', process.env.SOAK_POS_URL || 'http://localhost:3002')
    const apiUrl = getArg('--api-url', process.env.SOAK_API_URL || 'http://localhost:3001')
    const maxConsecutiveFailuresBeforeAlert = Number(
        getArg('--alert-threshold', process.env.SOAK_ALERT_FAILURE_THRESHOLD || '3')
    )

    const durationMs = Math.max(hours, 0.01) * 60 * 60 * 1000
    const intervalMs = Math.max(intervalSeconds, 5) * 1000

    const reportsDir = path.join(__dirname, 'reports')
    ensureDir(reportsDir)
    const runId = ts()
    const eventsPath = path.join(reportsDir, `stability-soak-events-${runId}.jsonl`)
    const summaryPath = path.join(reportsDir, `stability-soak-summary-${runId}.json`)

    const writeEvent = (obj) => {
        fs.appendFileSync(eventsPath, `${JSON.stringify(obj)}\n`, 'utf8')
    }

    let token = await getAdminToken()
    const summary = {
        runId,
        startedAt: nowIso(),
        config: {
            hours,
            intervalSeconds,
            posUrl,
            apiUrl,
            alertThreshold: maxConsecutiveFailuresBeforeAlert,
        },
        cycles: 0,
        failures: 0,
        consecutiveFailures: 0,
        maxConsecutiveFailures: 0,
        checks: {
            posRoot: { pass: 0, fail: 0, p95Ms: null },
            apiHealth: { pass: 0, fail: 0, p95Ms: null },
            apiDashboard: { pass: 0, fail: 0, p95Ms: null },
            dbPing: { pass: 0, fail: 0, p95Ms: null },
        },
        passRate: 0,
        status: 'running',
        evidence: { eventsPath, summaryPath },
    }

    const latencies = {
        posRoot: [],
        apiHealth: [],
        apiDashboard: [],
        dbPing: [],
    }

    const checkDashboard = async () => {
        if (!token) {
            return { ok: true, skipped: true, note: 'no admin token - dashboard check skipped' }
        }

        let result = await httpGet(
            `${apiUrl}/api/accounting/dashboard/stats`,
            { Authorization: `Bearer ${token}` }
        )

        if (result.status === 401) {
            token = await getAdminToken()
            if (!token) {
                return { ok: true, skipped: true, note: 'admin token unavailable after 401' }
            }
            result = await httpGet(
                `${apiUrl}/api/accounting/dashboard/stats`,
                { Authorization: `Bearer ${token}` }
            )
        }

        return result
    }

    const startedAt = Date.now()
    while ((Date.now() - startedAt) < durationMs) {
        summary.cycles += 1
        const cycleAt = nowIso()

        const [posRoot, apiHealth, apiDashboard, db] = await Promise.all([
            httpGet(`${posUrl}/`),
            httpGet(`${apiUrl}/api/health`),
            checkDashboard(),
            dbPing(),
        ])

        const checks = { posRoot, apiHealth, apiDashboard, dbPing: db }
        let cycleFailed = false
        for (const [name, result] of Object.entries(checks)) {
            if (result.ok) {
                summary.checks[name].pass += 1
                if (typeof result.latencyMs === 'number') latencies[name].push(result.latencyMs)
            } else {
                summary.checks[name].fail += 1
                cycleFailed = true
            }
        }

        if (cycleFailed) {
            summary.failures += 1
            summary.consecutiveFailures += 1
            summary.maxConsecutiveFailures = Math.max(
                summary.maxConsecutiveFailures,
                summary.consecutiveFailures
            )
        } else {
            summary.consecutiveFailures = 0
        }

        writeEvent({
            at: cycleAt,
            cycle: summary.cycles,
            cycleFailed,
            checks: {
                posRoot: {
                    ...checks.posRoot,
                    body: truncate(checks.posRoot.body),
                    error: truncate(checks.posRoot.error),
                },
                apiHealth: {
                    ...checks.apiHealth,
                    body: truncate(checks.apiHealth.body),
                    error: truncate(checks.apiHealth.error),
                },
                apiDashboard: {
                    ...checks.apiDashboard,
                    body: truncate(checks.apiDashboard.body),
                    error: truncate(checks.apiDashboard.error),
                },
                dbPing: {
                    ...checks.dbPing,
                    error: truncate(checks.dbPing.error),
                },
            },
        })

        if (summary.consecutiveFailures >= maxConsecutiveFailuresBeforeAlert) {
            await sendOpsAlert({
                level: 'error',
                message: `Stability soak detected ${summary.consecutiveFailures} consecutive failures`,
                metadata: {
                    method: 'SYSTEM',
                    url: '/ops/stability-soak-test',
                    error: checks,
                },
            }).catch(() => {})
        }

        await sleep(intervalMs)
    }

    const totalChecks = Object.values(summary.checks).reduce(
        (acc, row) => acc + row.pass + row.fail,
        0
    )
    const totalPass = Object.values(summary.checks).reduce((acc, row) => acc + row.pass, 0)

    for (const [name, list] of Object.entries(latencies)) {
        if (list.length === 0) continue
        const sorted = [...list].sort((a, b) => a - b)
        const idx = Math.floor(0.95 * (sorted.length - 1))
        summary.checks[name].p95Ms = sorted[idx]
    }

    summary.passRate = totalChecks > 0 ? Number(((totalPass / totalChecks) * 100).toFixed(2)) : 0
    summary.finishedAt = nowIso()
    summary.status = summary.failures === 0 ? 'pass' : 'warning'

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(`Soak test completed: ${summary.status}`)
    console.log(`Summary: ${summaryPath}`)
    console.log(`Events: ${eventsPath}`)

    await appSequelize.close().catch(() => {})
}

main().catch((error) => {
    console.error(`Soak test failed: ${error.message}`)
    process.exit(1)
})
