const express = require('express')
const router = express.Router()
const { authenticate, authorize } = require('../middleware/auth')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const readline = require('readline')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

// Ensure backup directory exists
const BACKUP_DIR = path.join(__dirname, '../../backups')
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

// Ensure exports directory exists
const EXPORT_DIR = path.join(__dirname, '../../exports')
if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
}
const RESTORE_UPLOAD_DIR = path.join(EXPORT_DIR, 'restore_uploads')
if (!fs.existsSync(RESTORE_UPLOAD_DIR)) {
    fs.mkdirSync(RESTORE_UPLOAD_DIR, { recursive: true })
}

// SQLite path (fallback if used)
const sqlitePath = path.join(__dirname, '../../data/restaurant.db')
const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json')
const UPLOADS_DIR = path.join(__dirname, '../../uploads')

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
}

const safeRemove = (targetPath) => {
    if (!targetPath || !fs.existsSync(targetPath)) return
    fs.rmSync(targetPath, { recursive: true, force: true })
}

const findFirstFileRecursive = (rootDir, predicate) => {
    if (!fs.existsSync(rootDir)) return null
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name)
        if (entry.isDirectory()) {
            const nested = findFirstFileRecursive(fullPath, predicate)
            if (nested) return nested
            continue
        }
        if (predicate(fullPath, entry.name)) return fullPath
    }
    return null
}

const restoreUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, RESTORE_UPLOAD_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase()
            const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            cb(null, `restore_${suffix}${ext}`)
        }
    }),
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase()
        const allowed = ['.zip', '.sql', '.sqlite', '.db']
        if (!allowed.includes(ext)) {
            cb(new Error('Unsupported backup format. Allowed: .zip, .sql, .sqlite, .db'))
            return
        }
        cb(null, true)
    }
})

// Find MySQL Dump path
function getMysqldumpBinary() {
    if (process.platform === 'win32') {
        const paths = [
            `C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysqldump.exe`,
            `C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe`,
            `C:\\xampp\\mysql\\bin\\mysqldump.exe`
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return `"${p}"`;
        }
    }
    return 'mysqldump';
}

const redactSecretsInSqlDump = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return
    let content = fs.readFileSync(filePath, 'utf8')

    // Direct key format redaction
    content = content.replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_$1_[REDACTED]')
    content = content.replace(/pk_(live|test)_[A-Za-z0-9]+/g, 'pk_$1_[REDACTED]')
    content = content.replace(/whsec_[A-Za-z0-9]+/g, 'whsec_[REDACTED]')

    // JSON-like field redaction (supports escaped JSON in SQL dumps)
    const sensitiveFields = ['secretKey', 'webhookSecret', 'securityKey', 'apiKey', 'hmac', 'hmacSecret']
    for (const field of sensitiveFields) {
        const doubleQuoted = new RegExp(`((?:\\\\)?\"${field}(?:\\\\)?\"\\s*:\\s*(?:\\\\)?\")([^\"\\\\]*(?:\\\\.[^\"\\\\]*)*)((?:\\\\)?\")`, 'gi')
        content = content.replace(doubleQuoted, '$1[REDACTED]$3')

        const singleQuoted = new RegExp(`('${field}'\\s*:\\s*')([^']*)(')`, 'gi')
        content = content.replace(singleQuoted, '$1[REDACTED]$3')
    }

    fs.writeFileSync(filePath, content, 'utf8')
}

// Helper function to perform MySQL dump
const performMySQLDump = async (outputPath) => {
    const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
    const mysqldumpBin = getMysqldumpBinary();
    const dumpCmd = `${mysqldumpBin} --single-transaction --routines --events --triggers --set-gtid-purged=OFF --no-tablespaces -h ${DB_HOST || 'localhost'} -P ${DB_PORT || 3306} -u ${DB_USER} -p"${DB_PASSWORD}" ${DB_NAME} > "${outputPath}"`;
    try {
        await execAsync(dumpCmd);
        redactSecretsInSqlDump(outputPath)
        return true;
    } catch (error) {
        console.error("MySQL Dump Error:", error);
        return false;
    }
}

function getMysqlBinary() {
    if (process.platform === 'win32') {
        const paths = [
            `C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysql.exe`,
            `C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe`,
            `C:\\xampp\\mysql\\bin\\mysql.exe`
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return `"${p}"`;
        }
    }
    return 'mysql';
}

const clearDirectoryContents = (dirPath, preserveNames = []) => {
    if (!fs.existsSync(dirPath)) return
    for (const entry of fs.readdirSync(dirPath)) {
        if (preserveNames.includes(entry)) continue
        const fullPath = path.join(dirPath, entry)
        fs.rmSync(fullPath, { recursive: true, force: true })
    }
}

const sanitizeMySQLDumpForRestore = async (sqlFilePath) => {
    const sanitizedPath = path.join(
        path.dirname(sqlFilePath),
        `${path.parse(sqlFilePath).name}_sanitized${path.extname(sqlFilePath) || '.sql'}`
    )

    const readStream = fs.createReadStream(sqlFilePath, { encoding: 'utf8' })
    const writeStream = fs.createWriteStream(sanitizedPath, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity })

    const shouldSkipLine = (line) => {
        const trimmed = String(line || '').trim()
        if (!trimmed) return false
        if (/^SET\s+@@GLOBAL\.GTID_PURGED\s*=+/i.test(trimmed)) return true
        if (/^SET\s+@@SESSION\.SQL_LOG_BIN\s*=+/i.test(trimmed)) return true
        if (/^SET\s+@@GLOBAL\.SQL_LOG_BIN\s*=+/i.test(trimmed)) return true
        return false
    }

    await new Promise((resolve, reject) => {
        rl.on('line', (line) => {
            if (!shouldSkipLine(line)) writeStream.write(`${line}\n`)
        })
        rl.on('close', resolve)
        rl.on('error', reject)
        readStream.on('error', reject)
        writeStream.on('error', reject)
    })

    await new Promise((resolve, reject) => {
        writeStream.end(resolve)
        writeStream.on('error', reject)
    })
    return sanitizedPath
}

const restoreMySQLFromSql = async (sqlFilePath) => {
    const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env
    const mysqlBin = getMysqlBinary()
    const dbHost = DB_HOST || 'localhost'
    const dbPort = DB_PORT || 3306
    const dbName = DB_NAME || 'pos_restaurant'
    const dbUser = DB_USER || 'root'
    const dbPassword = DB_PASSWORD || ''

    const recreateDbCmd = `${mysqlBin} -h ${dbHost} -P ${dbPort} -u ${dbUser} -p"${dbPassword}" -e "DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`
    await execAsync(recreateDbCmd)

    const sanitizedSqlPath = await sanitizeMySQLDumpForRestore(sqlFilePath)
    try {
        const importCmd = `${mysqlBin} -h ${dbHost} -P ${dbPort} -u ${dbUser} -p"${dbPassword}" ${dbName} < "${sanitizedSqlPath}"`
        await execAsync(importCmd)
    } finally {
        safeRemove(sanitizedSqlPath)
    }
}

// 1. Export Data Endpoint
router.post('/export', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { zip } = require('zip-a-folder')

        const tempExportFolder = path.join(EXPORT_DIR, `export_${Date.now()}`)
        fs.mkdirSync(tempExportFolder, { recursive: true })

        // Dump Database
        if (process.env.DB_DIALECT === 'mysql') {
            const sqlFile = path.join(tempExportFolder, 'database_backup.sql');
            await performMySQLDump(sqlFile);
        } else {
            if (fs.existsSync(sqlitePath)) {
                fs.copyFileSync(sqlitePath, path.join(tempExportFolder, 'database.sqlite'))
            }
        }

        // Copy Settings
        const settingsPath = path.join(__dirname, '../../data/settings.json')
        if (fs.existsSync(settingsPath)) {
            fs.copyFileSync(settingsPath, path.join(tempExportFolder, 'settings.json'))
        }

        const zipFilePath = path.join(EXPORT_DIR, `POS_Backup_${new Date().toISOString().split('T')[0]}.zip`)
        await zip(tempExportFolder, zipFilePath)

        // Cleanup temp folder
        fs.rmSync(tempExportFolder, { recursive: true, force: true })

        res.download(zipFilePath, `POS_Backup_${new Date().toISOString().split('T')[0]}.zip`, (err) => {
            if (err) console.error("Error downloading file:", err)
        })

    } catch (error) {
        console.error('Export Error:', error)
        res.status(500).json({ message: 'حدث خطأ أثناء تصدير البيانات' })
    }
})

// 2. Clear System Data (Factory Reset)
router.post('/reset', authenticate, authorize('admin'), async (req, res) => {
    try {
        const seedDemoData = req.body?.seed_demo_data === true
        const preserveUploads = req.body?.preserve_uploads === true
        const preserveSettings = req.body?.preserve_settings === true

        // Internal Backup before reset
        if (process.env.DB_DIALECT === 'mysql') {
            const backupPath = require('path').join(BACKUP_DIR, `pre_reset_${Date.now()}.sql`)
            await performMySQLDump(backupPath)
        } else if (fs.existsSync(sqlitePath)) {
            const backupPath = require('path').join(BACKUP_DIR, `pre_reset_${Date.now()}.sqlite`)
            fs.copyFileSync(sqlitePath, backupPath)
        }

        if (!preserveUploads) {
            clearDirectoryContents(UPLOADS_DIR, ['.gitkeep'])
            fs.mkdirSync(UPLOADS_DIR, { recursive: true })
            fs.mkdirSync(require('path').join(UPLOADS_DIR, 'journal-attachments'), { recursive: true })
            fs.mkdirSync(require('path').join(UPLOADS_DIR, 'entity-attachments'), { recursive: true })
        }

        if (!preserveSettings && fs.existsSync(SETTINGS_FILE)) {
            fs.rmSync(SETTINGS_FILE, { force: true })
        }

        const { sequelize, initDatabase } = require('../models')
        await sequelize.sync({ force: true })

        // Keep only bootstrap defaults (admin/branch/warehouse), skip demo catalog unless requested.
        await initDatabase({
            seedDemoData,
            seedPaymentGateways: true
        })

        res.json({
            message: '\u062a\u0645\u062a \u0625\u0639\u0627\u062f\u0629 \u062a\u0647\u064a\u0626\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 \u0628\u0646\u062c\u0627\u062d \u0648\u0641\u0642 \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u062d\u062f\u062f\u0629.',
            data: {
                seed_demo_data: seedDemoData,
                preserve_uploads: preserveUploads,
                preserve_settings: preserveSettings
            }
        })
    } catch (error) {
        console.error('System Reset Error:', error)
        res.status(500).json({ message: '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0625\u0639\u0627\u062f\u0629 \u062a\u0647\u064a\u0626\u0629 \u0627\u0644\u0646\u0638\u0627\u0645' })
    }
})

// 3. Backup (Internal only snapshot)
router.post('/backup', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (process.env.DB_DIALECT === 'mysql') {
            const backupName = `backup_${Date.now()}.sql`
            const backupPath = path.join(BACKUP_DIR, backupName)
            if (await performMySQLDump(backupPath)) {
                res.json({ message: 'تم حفظ نسخة احتياطية (SQL) بنجاح', file: backupName })
            } else {
                res.status(500).json({ message: 'فشل في أخذ اللقطة لـ MySQL' })
            }
        } else {
            const backupName = `backup_${Date.now()}.sqlite`
            const backupPath = path.join(BACKUP_DIR, backupName)
            if (fs.existsSync(sqlitePath)) {
                fs.copyFileSync(sqlitePath, backupPath)
                res.json({ message: 'تم حفظ نسخة احتياطية بنجاح', file: backupName })
            } else {
                res.status(404).json({ message: 'قاعدة البيانات غير موجودة' })
            }
        }
    } catch (error) {
        console.error('Backup Error:', error)
        res.status(500).json({ message: 'حدث خطأ أثناء أخذ النسخة الاحتياطية' })
    }
})

// 4. Restore Database from Backup (ZIP / SQL / SQLite)
router.post('/restore', authenticate, authorize('admin'), (req, res) => {
    restoreUpload.single('backup_file')(req, res, async (uploadError) => {
        if (uploadError) {
            return res.status(400).json({ message: uploadError.message || 'Invalid backup file upload' })
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Backup file is required' })
        }

        const filePath = req.file.path
        const originalName = req.file.originalname || req.file.filename
        const ext = path.extname(originalName).toLowerCase()
        const isMySQL = String(process.env.DB_DIALECT || 'mysql').toLowerCase() === 'mysql'
        const restoreSettings = parseBoolean(req.body?.restore_settings, true)

        const tempExtractDir = path.join(EXPORT_DIR, `restore_extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
        let sqlBackupPath = null
        let sqliteBackupPath = null
        let settingsBackupPath = null
        let preRestorePath = null

        try {
            if (ext === '.zip') {
                fs.mkdirSync(tempExtractDir, { recursive: true })
                const zip = new AdmZip(filePath)
                zip.extractAllTo(tempExtractDir, true)

                sqlBackupPath = findFirstFileRecursive(tempExtractDir, (full) => full.toLowerCase().endsWith('.sql'))
                sqliteBackupPath = findFirstFileRecursive(tempExtractDir, (full) => {
                    const f = full.toLowerCase()
                    return f.endsWith('.sqlite') || f.endsWith('.db')
                })
                settingsBackupPath = findFirstFileRecursive(tempExtractDir, (full, name) => name.toLowerCase() === 'settings.json')
            } else if (ext === '.sql') {
                sqlBackupPath = filePath
            } else if (ext === '.sqlite' || ext === '.db') {
                sqliteBackupPath = filePath
            }

            if (isMySQL) {
                if (!sqlBackupPath) {
                    return res.status(400).json({ message: 'MySQL restore requires a .sql backup file' })
                }

                preRestorePath = path.join(BACKUP_DIR, `pre_restore_${Date.now()}.sql`)
                const backupOk = await performMySQLDump(preRestorePath)
                if (!backupOk) {
                    return res.status(500).json({ message: 'Failed to create pre-restore backup. Restore aborted for safety.' })
                }
                await restoreMySQLFromSql(sqlBackupPath)
            } else {
                if (!sqliteBackupPath) {
                    return res.status(400).json({ message: 'SQLite restore requires a .sqlite/.db backup file' })
                }

                if (fs.existsSync(sqlitePath)) {
                    const preRestorePath = path.join(BACKUP_DIR, `pre_restore_${Date.now()}.sqlite`)
                    fs.copyFileSync(sqlitePath, preRestorePath)
                }
                fs.copyFileSync(sqliteBackupPath, sqlitePath)
            }

            if (restoreSettings && settingsBackupPath && fs.existsSync(settingsBackupPath)) {
                fs.copyFileSync(settingsBackupPath, SETTINGS_FILE)
            }

            return res.json({
                message: '\u062a\u0645\u062a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u0628\u0646\u062c\u0627\u062d. \u064a\u064f\u0631\u062c\u0649 \u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645.',
                data: {
                    source_file: originalName,
                    restore_settings: restoreSettings && !!settingsBackupPath,
                    restart_required: true
                }
            })
        } catch (error) {
            console.error('System Restore Error:', error)
            let rollbackRecovered = false
            if (isMySQL && preRestorePath && fs.existsSync(preRestorePath)) {
                try {
                    await restoreMySQLFromSql(preRestorePath)
                    rollbackRecovered = true
                } catch (rollbackError) {
                    console.error('Restore rollback failed:', rollbackError)
                }
            }
            return res.status(500).json({
                message: '\u0641\u0634\u0644\u062a \u0639\u0645\u0644\u064a\u0629 \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629',
                error: error.message,
                rollback_recovered: rollbackRecovered
            })
        } finally {
            safeRemove(filePath)
            safeRemove(tempExtractDir)
        }
    })
})

// 5. Restart Backend Process (for PM2/Nodemon-managed environments)
router.post('/restart', authenticate, authorize('admin'), async (req, res) => {
    const confirmed = parseBoolean(req.body?.confirm, false)
    if (!confirmed) {
        return res.status(400).json({
            message: '\u064a\u062c\u0628 \u062a\u0623\u0643\u064a\u062f \u0639\u0645\u0644\u064a\u0629 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0634\u063a\u064a\u0644'
        })
    }

    res.json({
        message: '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645',
        data: { restart_in_seconds: 2 }
    })

    // Allow response to complete before exiting process.
    setTimeout(() => process.exit(0), 2000)
})

module.exports = router
