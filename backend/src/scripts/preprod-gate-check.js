/**
 * Pre-Production Gate Check
 *
 * Validates minimum production-readiness controls for accounting:
 * 1) Hardening env flags
 * 2) Fresh backup snapshot existence
 * 3) ERP migration structural verification
 * 4) API authorization and branch-scope behavior
 *
 * Run:
 *   node src/scripts/preprod-gate-check.js
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { spawn } = require('child_process')
const http = require('http')
const https = require('https')
const jwt = require('jsonwebtoken')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { User, sequelize } = require('../models')

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function ok(message, details = {}) {
    return { status: 'pass', message, details }
}

function fail(message, details = {}) {
    return { status: 'fail', message, details }
}

async function getTokenByRole(role) {
    const user = await User.findOne({
        where: { role, is_active: true },
        order: [['created_at', 'ASC']]
    })
    if (!user) {
        return null
    }
    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    )
    return {
        role,
        id: user.id,
        branchId: user.branch_id || null,
        token
    }
}

async function hit(url, token) {
    return new Promise((resolve) => {
        const parsed = new URL(url)
        const transport = parsed.protocol === 'https:' ? https : http
        const req = transport.request(
            {
                method: 'GET',
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000
            },
            (res) => {
                let raw = ''
                res.on('data', (chunk) => { raw += chunk })
                res.on('end', () => {
                    let body = null
                    try {
                        body = JSON.parse(raw)
                    } catch (e) {
                        body = null
                    }
                    resolve({ status: res.statusCode || 0, body, networkError: null })
                })
            }
        )
        req.on('timeout', () => {
            req.destroy(new Error('request timeout'))
        })
        req.on('error', (error) => {
            resolve({
                status: 0,
                body: null,
                networkError: error.message || 'Network error'
            })
        })
        req.end()
    })
}

async function canReachApi() {
    return new Promise((resolve) => {
        const req = http.request(
            {
                method: 'GET',
                hostname: 'localhost',
                port: 3001,
                path: '/api/accounting/dashboard/stats',
                timeout: 3000
            },
            (res) => resolve(!!res.statusCode)
        )
        req.on('timeout', () => {
            req.destroy(new Error('timeout'))
        })
        req.on('error', () => resolve(false))
        req.end()
    })
}

async function run() {
    const report = {
        createdAt: new Date().toISOString(),
        targetEnv: process.env.TARGET_ENV || process.env.NODE_ENV || 'development',
        checks: [],
        summary: { pass: 0, fail: 0 }
    }
    let spawnedServer = null

    async function ensureApiServer() {
        if (await canReachApi()) {
            return { ok: true, startedByScript: false }
        }

        spawnedServer = spawn(process.execPath, ['src/server.js'], {
            cwd: path.join(__dirname, '../..'),
            stdio: 'ignore',
            windowsHide: true
        })

        const maxWaitMs = 90000
        const startedAt = Date.now()
        while ((Date.now() - startedAt) < maxWaitMs) {
            if (await canReachApi()) {
                return { ok: true, startedByScript: true }
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        return {
            ok: false,
            startedByScript: true
        }
    }

    try {
        // 1) Env hardening flags
        const strictDefaults = String(process.env.ACCOUNTING_STRICT_DEFAULTS || '').toLowerCase() === 'true'
        const autoRemap = String(process.env.ACCOUNTING_AUTO_REMAP_POSTING || '').toLowerCase() === 'true'
        const allowGlobalFallback = String(process.env.ACCOUNTING_ALLOW_GLOBAL_FALLBACK || '').toLowerCase() === 'true'

        report.checks.push(
            strictDefaults
                ? ok('ACCOUNTING_STRICT_DEFAULTS is enabled', { value: process.env.ACCOUNTING_STRICT_DEFAULTS })
                : fail('ACCOUNTING_STRICT_DEFAULTS must be true', { value: process.env.ACCOUNTING_STRICT_DEFAULTS })
        )
        report.checks.push(
            !autoRemap
                ? ok('ACCOUNTING_AUTO_REMAP_POSTING is disabled', { value: process.env.ACCOUNTING_AUTO_REMAP_POSTING })
                : fail('ACCOUNTING_AUTO_REMAP_POSTING must be false', { value: process.env.ACCOUNTING_AUTO_REMAP_POSTING })
        )
        report.checks.push(
            !allowGlobalFallback
                ? ok('ACCOUNTING_ALLOW_GLOBAL_FALLBACK is disabled', { value: process.env.ACCOUNTING_ALLOW_GLOBAL_FALLBACK })
                : fail('ACCOUNTING_ALLOW_GLOBAL_FALLBACK must be false', { value: process.env.ACCOUNTING_ALLOW_GLOBAL_FALLBACK })
        )

        // 2) Backup freshness
        const backupPath = path.join(__dirname, '../../data/pre-migration-snapshot.json')
        if (!fs.existsSync(backupPath)) {
            report.checks.push(fail('Backup snapshot file is missing', { path: backupPath }))
        } else {
            const stat = fs.statSync(backupPath)
            const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60)
            if (ageHours <= 24) {
                report.checks.push(ok('Backup snapshot is fresh (<= 24h)', {
                    path: backupPath,
                    modifiedAt: new Date(stat.mtimeMs).toISOString(),
                    ageHours: Math.round(ageHours * 100) / 100
                }))
            } else {
                report.checks.push(fail('Backup snapshot is stale (> 24h)', {
                    path: backupPath,
                    modifiedAt: new Date(stat.mtimeMs).toISOString(),
                    ageHours: Math.round(ageHours * 100) / 100
                }))
            }
        }

        // 3) Structural verification runner
        const verifyRun = spawnSync(
            process.execPath,
            [path.join(__dirname, 'verify-erpnext-migration.js')],
            { cwd: path.join(__dirname, '../..'), encoding: 'utf8' }
        )
        if (verifyRun.status === 0) {
            report.checks.push(ok('ERP migration verification passed', { exitCode: verifyRun.status }))
        } else {
            report.checks.push(fail('ERP migration verification failed', {
                exitCode: verifyRun.status,
                stderr: (verifyRun.stderr || '').slice(0, 3000)
            }))
        }

        // 4) API authorization/scope checks
        const base = 'http://localhost:3001/api/accounting'
        const apiReady = await ensureApiServer()
        if (!apiReady.ok) {
            report.checks.push(fail('API server is not reachable on http://localhost:3001'))
        }
        const hitWithRecovery = async (url, token) => {
            let result = await hit(url, token)
            if (result.status === 0) {
                const recovered = await ensureApiServer()
                if (recovered.ok) {
                    result = await hit(url, token)
                }
            }
            return result
        }

        const cashier = await getTokenByRole('cashier')
        const manager = await getTokenByRole('manager')
        const admin = await getTokenByRole('admin')

        if (!apiReady.ok) {
            // Skip live endpoint checks when API is unavailable
        } else if (!cashier || !manager || !admin) {
            report.checks.push(fail('Missing required active users for gate tests (cashier/manager/admin)', {
                hasCashier: !!cashier,
                hasManager: !!manager,
                hasAdmin: !!admin
            }))
        } else {
            const cashierPnl = await hitWithRecovery(`${base}/reports/profit-loss?periodFrom=2026-01&periodTo=2026-12`, cashier.token)
            report.checks.push(
                cashierPnl.status === 403
                    ? ok('Cashier is blocked from P&L report')
                    : fail('Cashier must be blocked from P&L report', {
                        status: cashierPnl.status,
                        body: cashierPnl.body,
                        networkError: cashierPnl.networkError
                    })
            )

            const managerPnl = await hitWithRecovery(`${base}/reports/profit-loss?periodFrom=2026-01&periodTo=2026-12`, manager.token)
            report.checks.push(
                managerPnl.status === 200
                    ? ok('Manager can access P&L report')
                    : fail('Manager must access P&L report', {
                        status: managerPnl.status,
                        body: managerPnl.body,
                        networkError: managerPnl.networkError
                    })
            )

            const fakeBranchId = '11111111-1111-1111-1111-111111111111'
            const mgrStatsOwn = await hitWithRecovery(`${base}/dashboard/stats`, manager.token)
            const mgrStatsFake = await hitWithRecovery(`${base}/dashboard/stats?branchId=${fakeBranchId}`, manager.token)
            const ownNet = mgrStatsOwn.body?.data?.summary?.netIncome
            const fakeNet = mgrStatsFake.body?.data?.summary?.netIncome
            report.checks.push(
                mgrStatsOwn.status === 200 && mgrStatsFake.status === 200 && ownNet === fakeNet
                    ? ok('Manager branch scope enforced on dashboard')
                    : fail('Manager branch scope check failed on dashboard', {
                        ownStatus: mgrStatsOwn.status,
                        fakeStatus: mgrStatsFake.status,
                        ownNet,
                        fakeNet,
                        ownNetworkError: mgrStatsOwn.networkError,
                        fakeNetworkError: mgrStatsFake.networkError
                    })
            )

            const adminStatsFake = await hitWithRecovery(`${base}/dashboard/stats?branchId=${fakeBranchId}`, admin.token)
            report.checks.push(
                adminStatsFake.status === 200
                    ? ok('Admin can query explicit branch scope')
                    : fail('Admin should be able to query explicit branch scope', {
                        status: adminStatsFake.status,
                        body: adminStatsFake.body,
                        networkError: adminStatsFake.networkError
                    })
            )
        }
    } finally {
        if (spawnedServer && !spawnedServer.killed) {
            try {
                process.kill(spawnedServer.pid)
            } catch (e) {
                // ignore kill errors
            }
        }
        try {
            await sequelize.close()
        } catch (e) {
            // ignore
        }
    }

    // Summary
    for (const c of report.checks) {
        if (c.status === 'pass') report.summary.pass += 1
        else report.summary.fail += 1
    }
    report.summary.total = report.summary.pass + report.summary.fail
    report.summary.gatePassed = report.summary.fail === 0

    // Persist report
    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
    }
    const reportPath = path.join(reportsDir, `preprod-gate-report-${ts()}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

    // Console output
    console.log('\n=== PREPROD GATE SUMMARY ===')
    console.log(`Pass: ${report.summary.pass}`)
    console.log(`Fail: ${report.summary.fail}`)
    console.log(`Gate Passed: ${report.summary.gatePassed}`)
    console.log(`Report: ${reportPath}\n`)

    if (!report.summary.gatePassed) {
        process.exit(1)
    }
}

run().catch((error) => {
    console.error('Preprod gate check crashed:', error)
    process.exit(1)
})
