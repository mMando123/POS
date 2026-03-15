/**
 * Daily Ops: MySQL backup + restore test.
 *
 * Run:
 *   node src/scripts/ops-backup-restore-test.js
 *
 * Optional flags:
 *   --skip-restore      Create backup only
 *   --keep-restore-db   Do not drop restore test DB
 */

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { Sequelize, QueryTypes } = require('sequelize')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { sequelize: appSequelize } = require('../models')

const { createPreMigrationBackup } = require('./backup-before-migration')

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function hasFlag(flag) {
    return process.argv.includes(flag)
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
    }
}

function resolveBinary(binaryName) {
    const executable = process.platform === 'win32' ? `${binaryName}.exe` : binaryName
    const candidates = []

    if (process.env.MYSQL_BIN_DIR) {
        candidates.push(path.join(process.env.MYSQL_BIN_DIR, executable))
    }

    if (process.platform === 'win32') {
        candidates.push(
            `C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\${executable}`,
            `C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\${executable}`,
            `C:\\xampp\\mysql\\bin\\${executable}`,
            `C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\${executable}`
        )
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    const locator = process.platform === 'win32' ? 'where' : 'which'
    const probe = spawnSync(locator, [executable], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout) {
        const first = probe.stdout.split(/\r?\n/).find((line) => line.trim())
        if (first) return first.trim()
    }

    return null
}

function runCommand(binary, args, { inputFile = null, env = {}, timeoutMs = 300000 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        })

        let stdout = ''
        let stderr = ''
        let finished = false

        const timer = setTimeout(() => {
            if (finished) return
            child.kill('SIGTERM')
            reject(new Error(`Command timeout after ${timeoutMs}ms: ${binary} ${args.join(' ')}`))
        }, timeoutMs)

        child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
        child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
        child.stdin.on('error', (error) => {
            // mysql may close stdin early when import fails; keep root error from process exit.
            if (error.code === 'EPIPE') return
            if (finished) return
            finished = true
            clearTimeout(timer)
            reject(error)
        })
        child.on('error', (error) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            reject(error)
        })

        if (inputFile) {
            const inputStream = fs.createReadStream(inputFile)
            inputStream.on('error', (error) => {
                if (finished) return
                finished = true
                clearTimeout(timer)
                reject(error)
            })
            inputStream.pipe(child.stdin)
        } else {
            child.stdin.end()
        }

        child.on('close', (code) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            if (code === 0) {
                resolve({ stdout, stderr })
                return
            }
            reject(new Error(`Command failed (${code}): ${binary} ${args.join(' ')}\n${stderr}`))
        })
    })
}

function runDump(binary, args, outputFile, { env = {}, timeoutMs = 300000 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, {
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        })

        const out = fs.createWriteStream(outputFile)
        let stderr = ''
        let finished = false

        const timer = setTimeout(() => {
            if (finished) return
            child.kill('SIGTERM')
            out.close()
            reject(new Error(`mysqldump timeout after ${timeoutMs}ms`))
        }, timeoutMs)

        child.stdout.pipe(out)
        child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
        child.on('error', (error) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            out.close()
            reject(error)
        })

        child.on('close', (code) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            out.end()
            if (code === 0) {
                resolve({ stderr })
                return
            }
            reject(new Error(`mysqldump failed (${code}): ${stderr}`))
        })
    })
}

function cleanupOldFiles(dirPath, maxAgeDays) {
    if (!fs.existsSync(dirPath)) return
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    for (const entry of fs.readdirSync(dirPath)) {
        const fullPath = path.join(dirPath, entry)
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) continue
        if ((now - stat.mtimeMs) > maxAgeMs) {
            fs.unlinkSync(fullPath)
        }
    }
}

async function loadTableCount(connection, table) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS c FROM \`${table}\``,
        { type: QueryTypes.SELECT }
    )
    const row = rows && rows[0] ? rows[0] : { c: 0 }
    return Number(row.c || row.COUNT || Object.values(row)[0] || 0)
}

async function compareCoreCounts(sourceDbName, restoreDbName, dbUser, dbPassword, dbHost, dbPort) {
    const tables = [
        'gl_accounts',
        'gl_journal_entries',
        'gl_journal_lines',
        'gl_account_defaults',
        'gl_fiscal_periods',
        'suppliers',
        'purchase_receipts',
        'purchase_returns',
        'orders',
    ]

    const source = new Sequelize(sourceDbName, dbUser, dbPassword, {
        host: dbHost,
        port: dbPort,
        dialect: 'mysql',
        logging: false,
    })
    const restored = new Sequelize(restoreDbName, dbUser, dbPassword, {
        host: dbHost,
        port: dbPort,
        dialect: 'mysql',
        logging: false,
    })

    const rows = []
    try {
        for (const table of tables) {
            const sourceCount = await loadTableCount(source, table)
            const restoredCount = await loadTableCount(restored, table)
            rows.push({
                table,
                sourceCount,
                restoredCount,
                matched: sourceCount === restoredCount,
            })
        }
    } finally {
        await source.close()
        await restored.close()
    }

    return rows
}

async function main() {
    const report = {
        createdAt: new Date().toISOString(),
        status: 'failed',
        checks: [],
        artifacts: {},
        summary: {},
    }

    const pushCheck = (status, title, details = {}) => {
        report.checks.push({ status, title, details })
    }

    try {
        const skipRestore = hasFlag('--skip-restore')
        const keepRestoreDb = hasFlag('--keep-restore-db')
        const retentionDays = Number(process.env.OPS_BACKUP_RETENTION_DAYS || 14)

        const dbDialect = String(process.env.DB_DIALECT || 'sqlite').toLowerCase()
        if (dbDialect !== 'mysql') {
            pushCheck('fail', 'DB_DIALECT must be mysql for ops-backup-restore-test', { dbDialect })
            throw new Error(`Unsupported DB_DIALECT: ${dbDialect}`)
        }

        const dbName = process.env.DB_NAME
        const dbUser = process.env.DB_USER
        const dbPassword = process.env.DB_PASSWORD
        const dbHost = process.env.DB_HOST || 'localhost'
        const dbPort = Number(process.env.DB_PORT || 3306)
        if (!dbName || !dbUser) {
            throw new Error('Missing required DB_NAME/DB_USER in environment')
        }

        const mysqldump = resolveBinary('mysqldump')
        const mysql = resolveBinary('mysql')
        report.artifacts.mysqlBinaries = { mysqldump, mysql }
        if (!mysqldump || !mysql) {
            pushCheck('fail', 'MySQL client binaries were not found', {
                hint: 'Set MYSQL_BIN_DIR to MySQL bin path',
            })
            throw new Error('MySQL binaries not found (mysqldump/mysql)')
        }
        pushCheck('pass', 'MySQL client binaries resolved', { mysqldump, mysql })

        const backupDir = path.join(__dirname, '../../data/backups/daily')
        const reportsDir = path.join(__dirname, 'reports')
        ensureDir(backupDir)
        ensureDir(reportsDir)

        const backupFilename = `daily-backup-${ts()}.sql`
        const backupPath = path.join(backupDir, backupFilename)
        report.artifacts.backupPath = backupPath

        const commandEnv = { MYSQL_PWD: dbPassword }
        const commonArgs = ['--protocol=TCP', '-h', dbHost, '-P', String(dbPort), '-u', dbUser]

        console.log('\n[OPS] Creating accounting snapshot backup...')
        await createPreMigrationBackup()
        pushCheck('pass', 'Accounting snapshot backup created', {
            file: path.join(__dirname, '../../data/pre-migration-snapshot.json'),
        })

        console.log('[OPS] Creating MySQL SQL dump...')
        await runDump(
            mysqldump,
            [
                ...commonArgs,
                '--single-transaction',
                '--set-gtid-purged=OFF',
                '--routines',
                '--triggers',
                '--events',
                dbName,
            ],
            backupPath,
            { env: commandEnv, timeoutMs: 15 * 60 * 1000 }
        )
        pushCheck('pass', 'MySQL dump created', { backupPath })

        const restoreDbName = `${dbName}_restore_test`
        report.artifacts.restoreDbName = restoreDbName

        if (!skipRestore) {
            const resetRestoreSql = `DROP DATABASE IF EXISTS \`${restoreDbName}\`; CREATE DATABASE \`${restoreDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
            console.log('[OPS] Preparing restore test database...')
            await runCommand(mysql, [...commonArgs, '-e', resetRestoreSql], {
                env: commandEnv,
            })
            pushCheck('pass', 'Restore test database prepared', { restoreDbName })

            console.log('[OPS] Restoring SQL dump into restore test database...')
            await runCommand(mysql, [...commonArgs, restoreDbName], {
                env: commandEnv,
                inputFile: backupPath,
                timeoutMs: 15 * 60 * 1000,
            })
            pushCheck('pass', 'Restore completed', { restoreDbName })

            console.log('[OPS] Comparing source vs restored table counts...')
            const comparisons = await compareCoreCounts(
                dbName,
                restoreDbName,
                dbUser,
                dbPassword,
                dbHost,
                dbPort
            )
            report.summary.tableComparisons = comparisons

            const mismatches = comparisons.filter((row) => !row.matched)
            if (mismatches.length > 0) {
                pushCheck('fail', 'Restore validation failed (count mismatch)', { mismatches })
                throw new Error(`Restore mismatch detected on ${mismatches.length} tables`)
            }
            pushCheck('pass', 'Restore validation passed (table counts matched)', {
                tablesChecked: comparisons.length,
            })
        } else {
            pushCheck('pass', 'Restore step skipped by flag', { flag: '--skip-restore' })
        }

        if (!skipRestore && !keepRestoreDb) {
            console.log('[OPS] Cleaning restore test database...')
            await runCommand(
                mysql,
                [...commonArgs, '-e', `DROP DATABASE IF EXISTS \`${restoreDbName}\`;`],
                { env: commandEnv }
            )
            pushCheck('pass', 'Restore test database dropped', { restoreDbName })
        }

        cleanupOldFiles(backupDir, retentionDays)
        cleanupOldFiles(reportsDir, retentionDays)
        pushCheck('pass', 'Retention cleanup applied', { retentionDays })

        report.status = 'passed'
    } catch (error) {
        pushCheck('fail', 'Ops backup/restore execution failed', {
            error: error.message,
        })
        report.error = { message: error.message }
        console.error(`\n[OPS] FAILED: ${error.message}`)
    } finally {
        const passCount = report.checks.filter((c) => c.status === 'pass').length
        const failCount = report.checks.filter((c) => c.status === 'fail').length
        report.summary.pass = passCount
        report.summary.fail = failCount
        report.summary.total = report.checks.length
        report.summary.ok = report.status === 'passed' && failCount === 0

        const reportsDir = path.join(__dirname, 'reports')
        ensureDir(reportsDir)
        const reportPath = path.join(reportsDir, `ops-backup-restore-report-${ts()}.json`)
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
        console.log(`\n[OPS] Report: ${reportPath}`)
        console.log(`[OPS] Result: ${report.summary.ok ? 'PASS' : 'FAIL'} (${report.summary.pass} pass, ${report.summary.fail} fail)`)

        try {
            await appSequelize.close()
        } catch (closeError) {
            console.warn(`[OPS] Warning: could not close app sequelize: ${closeError.message}`)
        }

        if (!report.summary.ok) {
            process.exit(1)
        }
    }
}

main().catch((error) => {
    console.error(`[OPS] Script crashed: ${error.message}`)
    process.exit(1)
})
