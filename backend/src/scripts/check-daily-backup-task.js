/**
 * Verify Windows daily backup task and store evidence report.
 *
 * Run:
 *   node src/scripts/check-daily-backup-task.js
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function extractField(text, label) {
    const line = text.split(/\r?\n/).find((row) => row.trim().startsWith(label))
    if (!line) return null
    const idx = line.indexOf(':')
    if (idx < 0) return null
    return line.slice(idx + 1).trim()
}

function main() {
    const taskName = process.env.OPS_BACKUP_TASK_NAME || 'SmartPOS-Daily-Backup-Restore'
    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
    }

    const report = {
        createdAt: new Date().toISOString(),
        taskName,
        platform: process.platform,
        ok: false,
    }

    if (process.platform !== 'win32') {
        report.error = 'Task Scheduler verification is only supported on Windows.'
    } else {
        const query = spawnSync(
            'schtasks',
            ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
            { encoding: 'utf8', windowsHide: true }
        )

        if (query.status !== 0) {
            report.error = query.stderr || query.stdout || 'Task query failed'
        } else {
            const raw = query.stdout || ''
            const status = extractField(raw, 'Status')
            const nextRunTime = extractField(raw, 'Next Run Time')
            const lastRunTime = extractField(raw, 'Last Run Time')
            const lastResult = extractField(raw, 'Last Result')
            report.details = {
                status,
                nextRunTime,
                lastRunTime,
                lastResult,
            }
            report.ok = status === 'Ready' && lastResult === '0'
        }
    }

    const reportPath = path.join(reportsDir, `ops-scheduler-report-${ts()}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

    console.log('Task:', taskName)
    console.log('OK:', report.ok)
    console.log('Report:', reportPath)
    if (report.error) {
        console.log('Error:', report.error)
    } else if (report.details) {
        console.log('Details:', report.details)
    }

    if (!report.ok) {
        process.exit(1)
    }
}

try {
    main()
} catch (error) {
    console.error(`Scheduler check failed: ${error.message}`)
    process.exit(1)
}

