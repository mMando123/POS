/**
 * Controlled DB rollback from SQL backup.
 *
 * Safety model:
 * 1) Dry-run by default.
 * 2) Apply requires: --apply --confirm-db=<targetDb> --file=<path>.
 * 3) Always creates pre-rollback dump before replacing target DB.
 *
 * Run:
 *   node src/scripts/rollback-from-backup.js --file=../../data/backups/daily/daily-backup-xxx.sql
 *   node src/scripts/rollback-from-backup.js --apply --confirm-db=pos_restaurant --file=../../data/backups/daily/daily-backup-xxx.sql
 */

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { Sequelize, QueryTypes } = require('sequelize')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function getArg(name, fallback = null) {
    const exact = process.argv.find((arg) => arg === name)
    if (exact) return true
    const match = process.argv.find((arg) => arg.startsWith(`${name}=`))
    if (!match) return fallback
    return match.slice(name.length + 1)
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
            `C:\\xampp\\mysql\\bin\\${executable}`
        )
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
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

        let stderr = ''
        let finished = false
        const timer = setTimeout(() => {
            if (finished) return
            child.kill('SIGTERM')
            reject(new Error(`Command timeout after ${timeoutMs}ms`))
        }, timeoutMs)

        child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
        child.on('error', (error) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            reject(error)
        })

        if (inputFile) {
            fs.createReadStream(inputFile).pipe(child.stdin)
        } else {
            child.stdin.end()
        }

        child.on('close', (code) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            if (code === 0) {
                resolve({ ok: true })
                return
            }
            reject(new Error(`Command failed (${code}): ${stderr}`))
        })
    })
}

function runDump(binary, args, outputFile, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, {
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        })
        const out = fs.createWriteStream(outputFile)
        let stderr = ''

        child.stdout.pipe(out)
        child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
        child.on('error', reject)
        child.on('close', (code) => {
            out.end()
            if (code === 0) {
                resolve({ ok: true })
                return
            }
            reject(new Error(`mysqldump failed (${code}): ${stderr}`))
        })
    })
}

async function sanityCheckDb(dbName, dbUser, dbPassword, dbHost, dbPort) {
    const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
        host: dbHost,
        port: dbPort,
        dialect: 'mysql',
        logging: false,
    })

    try {
        const glAccounts = await sequelize.query(
            'SELECT COUNT(*) AS c FROM `gl_accounts`',
            { type: QueryTypes.SELECT }
        )
        const glEntries = await sequelize.query(
            'SELECT COUNT(*) AS c FROM `gl_journal_entries`',
            { type: QueryTypes.SELECT }
        )
        return {
            glAccounts: Number(glAccounts[0]?.c || 0),
            glJournalEntries: Number(glEntries[0]?.c || 0),
        }
    } finally {
        await sequelize.close()
    }
}

async function main() {
    const apply = !!getArg('--apply', false)
    const fileArg = getArg('--file', null)
    const targetDb = getArg('--target-db', process.env.DB_NAME)
    const confirmDb = getArg('--confirm-db', null)

    if (!fileArg) {
        throw new Error('Missing required --file=<sql-backup-path>')
    }
    const backupFile = path.resolve(process.cwd(), fileArg)
    if (!fs.existsSync(backupFile)) {
        throw new Error(`Backup file not found: ${backupFile}`)
    }

    if (!targetDb) {
        throw new Error('Target DB is empty (set DB_NAME or --target-db)')
    }

    if (!apply) {
        console.log('Rollback dry-run:')
        console.log(`  target-db: ${targetDb}`)
        console.log(`  backup:    ${backupFile}`)
        console.log('To execute rollback, run with:')
        console.log(`  --apply --confirm-db=${targetDb} --file="${backupFile}"`)
        return
    }

    if (confirmDb !== targetDb) {
        throw new Error(`Safety check failed: --confirm-db must exactly match target db (${targetDb})`)
    }

    const dbUser = process.env.DB_USER
    const dbPassword = process.env.DB_PASSWORD
    const dbHost = process.env.DB_HOST || 'localhost'
    const dbPort = Number(process.env.DB_PORT || 3306)
    if (!dbUser) {
        throw new Error('Missing DB_USER in env')
    }

    const mysqldump = resolveBinary('mysqldump')
    const mysql = resolveBinary('mysql')
    if (!mysqldump || !mysql) {
        throw new Error('MySQL binaries not found (set MYSQL_BIN_DIR)')
    }

    const commandEnv = { MYSQL_PWD: dbPassword }
    const commonArgs = ['--protocol=TCP', '-h', dbHost, '-P', String(dbPort), '-u', dbUser]
    const rollbackDir = path.join(__dirname, '../../data/backups/rollback')
    const reportsDir = path.join(__dirname, 'reports')
    ensureDir(rollbackDir)
    ensureDir(reportsDir)

    const preRollbackDump = path.join(rollbackDir, `pre-rollback-${targetDb}-${ts()}.sql`)
    const verifyDb = `${targetDb}_rollback_verify`

    console.log('[ROLLBACK] Creating pre-rollback dump of current target DB...')
    await runDump(mysqldump, [...commonArgs, '--single-transaction', targetDb], preRollbackDump, commandEnv)

    console.log('[ROLLBACK] Verifying backup file by restoring into temporary verification DB...')
    const resetVerifySql = `DROP DATABASE IF EXISTS \`${verifyDb}\`; CREATE DATABASE \`${verifyDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    await runCommand(mysql, [...commonArgs, '-e', resetVerifySql], { env: commandEnv })
    await runCommand(mysql, [...commonArgs, verifyDb], { env: commandEnv, inputFile: backupFile })

    const sanity = await sanityCheckDb(verifyDb, dbUser, dbPassword, dbHost, dbPort)
    if (sanity.glAccounts <= 0) {
        throw new Error('Sanity check failed: gl_accounts is empty in verification DB')
    }

    console.log('[ROLLBACK] Applying backup to target DB...')
    const resetTargetSql = `DROP DATABASE IF EXISTS \`${targetDb}\`; CREATE DATABASE \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    await runCommand(mysql, [...commonArgs, '-e', resetTargetSql], { env: commandEnv })
    await runCommand(mysql, [...commonArgs, targetDb], { env: commandEnv, inputFile: backupFile })

    await runCommand(mysql, [...commonArgs, '-e', `DROP DATABASE IF EXISTS \`${verifyDb}\`;`], { env: commandEnv })

    const finalSanity = await sanityCheckDb(targetDb, dbUser, dbPassword, dbHost, dbPort)

    const report = {
        createdAt: new Date().toISOString(),
        targetDb,
        backupFile,
        preRollbackDump,
        verification: sanity,
        finalSanity,
        status: 'applied',
    }
    const reportPath = path.join(reportsDir, `rollback-report-${ts()}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

    console.log('[ROLLBACK] Completed successfully.')
    console.log(`[ROLLBACK] Report: ${reportPath}`)
}

main().catch((error) => {
    console.error(`[ROLLBACK] Failed: ${error.message}`)
    process.exit(1)
})

