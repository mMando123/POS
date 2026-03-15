/**
 * Check stability soak status (interim/final) and optionally write approval note.
 *
 * Run:
 *   node src/scripts/check-soak-status.js
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function listFiles(dir, prefix) {
    if (!fs.existsSync(dir)) return []
    return fs
        .readdirSync(dir)
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({
            name,
            full: path.join(dir, name),
            mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function readJsonLines(filePath) {
    if (!fs.existsSync(filePath)) return []
    return fs
        .readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            try { return JSON.parse(line) } catch { return null }
        })
        .filter(Boolean)
}

function summarizeEvents(events) {
    const names = ['posRoot', 'apiHealth', 'apiDashboard', 'dbPing']
    const counts = {}
    for (const n of names) counts[n] = { pass: 0, fail: 0 }
    let failures = 0
    for (const e of events) {
        if (e.cycleFailed) failures += 1
        for (const n of names) {
            if (e.checks?.[n]?.ok) counts[n].pass += 1
            else counts[n].fail += 1
        }
    }
    const totalChecks = events.length * names.length
    const totalPass = Object.values(counts).reduce((acc, row) => acc + row.pass, 0)
    const passRate = totalChecks > 0 ? Number(((totalPass / totalChecks) * 100).toFixed(2)) : 0
    return {
        cycles: events.length,
        failures,
        passRate,
        lastAt: events.length ? events[events.length - 1].at : null,
        counts,
    }
}

function findRunningSoakProcess() {
    if (process.platform !== 'win32') return null
    const probe = spawnSync(
        'powershell',
        [
            '-NoProfile',
            '-Command',
            "Get-CimInstance Win32_Process | Where-Object { (($_.Name -eq 'cmd.exe') -or ($_.Name -eq 'node.exe')) -and $_.CommandLine -like '*stability-soak-test.js*' -and $_.CommandLine -like '*--hours=24*' } | Sort-Object CreationDate -Descending | Select-Object -First 1 ProcessId,Name,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: 'utf8', windowsHide: true }
    )
    if (probe.status !== 0 || !probe.stdout.trim()) return null
    try {
        return JSON.parse(probe.stdout.trim())
    } catch {
        return null
    }
}

function main() {
    const reportsDir = path.join(__dirname, 'reports')
    const eventsFiles = listFiles(reportsDir, 'stability-soak-events-')
    if (eventsFiles.length === 0) {
        console.log('No soak events files found.')
        process.exit(1)
    }

    const latestEvents = eventsFiles[0]
    const runId = latestEvents.name
        .replace('stability-soak-events-', '')
        .replace('.jsonl', '')
    const summaryPath = path.join(reportsDir, `stability-soak-summary-${runId}.json`)

    const running = findRunningSoakProcess()
    const events = readJsonLines(latestEvents.full)
    const interim = summarizeEvents(events)

    const output = {
        runId,
        eventsFile: latestEvents.full,
        summaryFile: summaryPath,
        running: !!running,
        runningProcess: running,
        interim,
        final: null,
        approval: null,
    }

    if (fs.existsSync(summaryPath)) {
        const final = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
        output.final = final

        const approved = final.status === 'pass' && Number(final.passRate || 0) >= 99
        const approvalText = [
            '# Stability Soak Approval',
            '',
            `Run ID: ${runId}`,
            `Finished At: ${final.finishedAt || 'N/A'}`,
            `Pass Rate: ${final.passRate}%`,
            `Failures: ${final.failures}`,
            `Status: ${final.status}`,
            '',
            `Approval Decision: ${approved ? 'APPROVED' : 'REVIEW REQUIRED'}`,
            '',
            `Evidence Summary: ${summaryPath}`,
            `Evidence Events: ${latestEvents.full}`,
            '',
        ].join('\n')
        const approvalPath = path.join(reportsDir, `stability-soak-approval-${runId}.md`)
        fs.writeFileSync(approvalPath, approvalText, 'utf8')
        output.approval = { approved, approvalPath }
    }

    console.log(JSON.stringify(output, null, 2))
}

try {
    main()
} catch (error) {
    console.error(`check-soak-status failed: ${error.message}`)
    process.exit(1)
}
