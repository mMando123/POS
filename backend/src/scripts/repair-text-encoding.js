/**
 * Repair mojibake / garbled text in MySQL text columns.
 *
 * Default mode: dry-run (no DB writes).
 * Apply mode:   --apply
 *
 * Examples:
 *   node src/scripts/repair-text-encoding.js
 *   node src/scripts/repair-text-encoding.js --apply
 *   node src/scripts/repair-text-encoding.js --apply --tables=warehouses,users,branches
 *   node src/scripts/repair-text-encoding.js --apply --columns=name_ar,location
 */

const fs = require('fs')
const path = require('path')
const { QueryTypes } = require('sequelize')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { sequelize } = require('../config/database')

const TEXT_DATA_TYPES = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext'])
const HUMAN_COLUMN_PATTERN = /(name|title|description|address|location|notes|comment|message|reason|summary|label|display|city|state|country|vendor|subject|strengths|goals|improvement|text)/
const EXCLUDED_COLUMN_PATTERN = /(password|hash|token|secret|signature|checksum|template|html|json|sql|path|url|email|username|iban|account_number|content)/

const SUSPICIOUS_CHAR_REGEX = /[ÃÂØÙÐÑÏ]/g
const REPLACEMENT_REGEX = /ï¿½|�/g
const QUESTION_RUN_REGEX = /\?{3,}/g
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g
const ARABIC_REGEX = /[\u0600-\u06FF]/g
const LATIN_REGEX = /[A-Za-z]/g

function parseArgs(argv) {
    const args = {
        apply: false,
        batchSize: 500,
        maxPasses: 3,
        tables: [],
        columns: [],
        includeAllTextColumns: false,
        verbose: false
    }

    for (const arg of argv.slice(2)) {
        if (arg === '--apply') args.apply = true
        else if (arg === '--verbose') args.verbose = true
        else if (arg === '--all-text-columns') args.includeAllTextColumns = true
        else if (arg.startsWith('--batch-size=')) args.batchSize = Math.max(1, parseInt(arg.split('=')[1], 10) || 500)
        else if (arg.startsWith('--max-passes=')) args.maxPasses = Math.max(1, Math.min(5, parseInt(arg.split('=')[1], 10) || 3))
        else if (arg.startsWith('--tables=')) args.tables = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)
        else if (arg.startsWith('--columns=')) args.columns = arg.split('=')[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        else if (arg === '--help' || arg === '-h') args.help = true
    }

    return args
}

function printHelp() {
    console.log('Text Encoding Repair Script')
    console.log('')
    console.log('Usage:')
    console.log('  node src/scripts/repair-text-encoding.js [options]')
    console.log('')
    console.log('Options:')
    console.log('  --apply                 Apply changes (default is dry-run)')
    console.log('  --tables=a,b,c          Limit processing to specific tables')
    console.log('  --columns=a,b,c         Limit processing to specific columns')
    console.log('  --all-text-columns      Process all text columns (not only human-facing columns)')
    console.log('  --batch-size=500        Rows per scan batch')
    console.log('  --max-passes=3          Max decode attempts per value (1-5)')
    console.log('  --verbose               Print sample changed values')
    console.log('  --help                  Show this message')
}

function quoteIdentifier(identifier) {
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
        throw new Error(`Unsafe SQL identifier: ${identifier}`)
    }
    return `\`${identifier}\``
}

function countMatches(value, regex) {
    return (String(value || '').match(regex) || []).length
}

function isSuspicious(value) {
    if (typeof value !== 'string' || value.length === 0) return false
    return (
        countMatches(value, SUSPICIOUS_CHAR_REGEX) > 0
        || countMatches(value, REPLACEMENT_REGEX) > 0
        || countMatches(value, QUESTION_RUN_REGEX) > 0
    )
}

function qualityScore(value) {
    const text = String(value || '')
    const arabic = countMatches(text, ARABIC_REGEX)
    const latin = countMatches(text, LATIN_REGEX)
    const suspicious = countMatches(text, SUSPICIOUS_CHAR_REGEX)
    const replacement = countMatches(text, REPLACEMENT_REGEX)
    const questionRuns = countMatches(text, QUESTION_RUN_REGEX)
    const controlChars = countMatches(text, CONTROL_CHAR_REGEX)

    return (arabic * 4) + (latin * 0.25) - (suspicious * 6) - (replacement * 12) - (questionRuns * 4) - (controlChars * 20)
}

function decodeLatin1AsUtf8(value) {
    try {
        return Buffer.from(String(value), 'latin1').toString('utf8')
    } catch (_) {
        return String(value)
    }
}

function maybeRepairValue(value, maxPasses = 3) {
    const source = String(value || '')
    if (!source || !isSuspicious(source)) {
        return { changed: false, value: source, reason: 'clean_or_empty' }
    }

    const candidates = [source]
    let current = source

    for (let i = 0; i < maxPasses; i += 1) {
        const decoded = decodeLatin1AsUtf8(current)
        if (!decoded || decoded === current) break
        candidates.push(decoded)
        current = decoded
    }

    let best = source
    let bestScore = qualityScore(source)
    let bestSuspicious = countMatches(source, SUSPICIOUS_CHAR_REGEX) + countMatches(source, REPLACEMENT_REGEX)
    const sourceArabic = countMatches(source, ARABIC_REGEX)

    for (const candidate of candidates.slice(1)) {
        const candidateScore = qualityScore(candidate)
        const candidateSuspicious = countMatches(candidate, SUSPICIOUS_CHAR_REGEX) + countMatches(candidate, REPLACEMENT_REGEX)
        const candidateReplacement = countMatches(candidate, REPLACEMENT_REGEX)
        const candidateControls = countMatches(candidate, CONTROL_CHAR_REGEX)
        const candidateArabic = countMatches(candidate, ARABIC_REGEX)
        const hasHardCorruption = candidateReplacement > 0 || candidateControls > 0

        const improved = (
            !hasHardCorruption &&
            (candidateScore > bestScore + 2) &&
            (candidateSuspicious < bestSuspicious) &&
            (candidateArabic >= sourceArabic || sourceArabic === 0)
        )
        if (improved) {
            best = candidate
            bestScore = candidateScore
            bestSuspicious = candidateSuspicious
        }
    }

    if (best !== source) {
        return { changed: true, value: best, reason: 'decoded' }
    }

    if (countMatches(source, QUESTION_RUN_REGEX) > 0) {
        return { changed: false, value: source, reason: 'unrecoverable_question_marks' }
    }

    return { changed: false, value: source, reason: 'no_better_candidate' }
}

function shouldProcessColumn(columnName, includeAllTextColumns, forcedColumns) {
    const name = String(columnName || '').toLowerCase()
    if (forcedColumns.length > 0) return forcedColumns.includes(name)
    if (includeAllTextColumns) return true

    if (name.endsWith('_ar') || name.endsWith('_en')) return true
    if (EXCLUDED_COLUMN_PATTERN.test(name)) return false
    return HUMAN_COLUMN_PATTERN.test(name)
}

function buildSuspiciousWhere(columnName) {
    const col = quoteIdentifier(columnName)
    return `${col} IS NOT NULL
      AND ${col} <> ''
      AND (
        BINARY ${col} LIKE _binary '%Ã%'
        OR BINARY ${col} LIKE _binary '%Â%'
        OR BINARY ${col} LIKE _binary '%Ø%'
        OR BINARY ${col} LIKE _binary '%Ù%'
        OR BINARY ${col} LIKE _binary '%Ð%'
        OR BINARY ${col} LIKE _binary '%Ñ%'
        OR BINARY ${col} LIKE _binary '%Ï%'
        OR BINARY ${col} LIKE _binary '%ï¿½%'
        OR BINARY ${col} LIKE _binary '%�%'
        OR ${col} REGEXP '\\\\?{3,}'
      )`
}

function buildPkWhere(pkColumns) {
    return pkColumns.map((pk) => `${quoteIdentifier(pk)} = :pk_${pk}`).join(' AND ')
}

async function getDatabaseName() {
    const row = await sequelize.query('SELECT DATABASE() AS dbName', { type: QueryTypes.SELECT, plain: true })
    return row?.dbName || null
}

async function loadTextColumns(schemaName) {
    return sequelize.query(`
        SELECT
            TABLE_NAME AS tableName,
            COLUMN_NAME AS columnName,
            DATA_TYPE AS dataType
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = :schemaName
          AND DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext')
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, {
        replacements: { schemaName },
        type: QueryTypes.SELECT
    })
}

async function loadPrimaryKeys(schemaName) {
    const rows = await sequelize.query(`
        SELECT
            TABLE_NAME AS tableName,
            COLUMN_NAME AS columnName,
            ORDINAL_POSITION AS ordinalPosition
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = :schemaName
          AND COLUMN_KEY = 'PRI'
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, {
        replacements: { schemaName },
        type: QueryTypes.SELECT
    })

    const pkMap = new Map()
    for (const row of rows) {
        if (!pkMap.has(row.tableName)) pkMap.set(row.tableName, [])
        pkMap.get(row.tableName).push(row.columnName)
    }
    return pkMap
}

function writeReport(report) {
    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(reportsDir, `text-encoding-repair-${ts}.json`)
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8')
    return filePath
}

async function processColumn({
    tableName,
    columnName,
    pkColumns,
    apply,
    batchSize,
    maxPasses,
    verbose
}) {
    const tableRef = quoteIdentifier(tableName)
    const colRef = quoteIdentifier(columnName)
    const pkRefs = pkColumns.map(quoteIdentifier).join(', ')
    const whereClause = buildSuspiciousWhere(columnName)
    const updateWhere = buildPkWhere(pkColumns)

    const stats = {
        tableName,
        columnName,
        candidates: 0,
        repaired: 0,
        unrecoverable: 0,
        unchanged: 0,
        samples: [],
        unrecoverableSamples: []
    }

    let offset = 0
    while (true) {
        const limitClause = apply
            ? 'LIMIT :limit'
            : 'LIMIT :limit OFFSET :offset'

        const rows = await sequelize.query(
            `SELECT ${pkRefs}, ${colRef} AS __value
             FROM ${tableRef}
             WHERE ${whereClause}
             ${limitClause}`,
            {
                replacements: { limit: batchSize, offset },
                type: QueryTypes.SELECT
            }
        )

        if (!rows.length) break

        for (const row of rows) {
            const source = row.__value
            const repaired = maybeRepairValue(source, maxPasses)
            stats.candidates += 1

            if (repaired.changed) {
                stats.repaired += 1
                if (verbose && stats.samples.length < 10) {
                    stats.samples.push({ before: source, after: repaired.value })
                }

                if (apply) {
                    const replacements = { newValue: repaired.value }
                    for (const pk of pkColumns) replacements[`pk_${pk}`] = row[pk]
                    await sequelize.query(
                        `UPDATE ${tableRef}
                         SET ${colRef} = :newValue
                         WHERE ${updateWhere}`,
                        { replacements, type: QueryTypes.UPDATE }
                    )
                }
            } else if (repaired.reason === 'unrecoverable_question_marks') {
                stats.unrecoverable += 1
                if (stats.unrecoverableSamples.length < 20) {
                    const pkSnapshot = {}
                    for (const pk of pkColumns) pkSnapshot[pk] = row[pk]
                    stats.unrecoverableSamples.push({
                        ...pkSnapshot,
                        value: source
                    })
                }
            } else {
                stats.unchanged += 1
            }
        }

        if (!apply) {
            offset += rows.length
        }

        if (rows.length < batchSize) break
    }

    return stats
}

async function main() {
    const args = parseArgs(process.argv)
    if (args.help) {
        printHelp()
        return
    }

    const dialect = sequelize.getDialect()
    if (dialect !== 'mysql') {
        throw new Error(`This script currently supports MySQL only. Current dialect: ${dialect}`)
    }

    const schemaName = await getDatabaseName()
    if (!schemaName) throw new Error('Failed to detect active database name')

    console.log(`[text-repair] mode=${args.apply ? 'APPLY' : 'DRY-RUN'}`)
    console.log(`[text-repair] database=${schemaName}, batchSize=${args.batchSize}, maxPasses=${args.maxPasses}`)

    const allColumns = await loadTextColumns(schemaName)
    const pkMap = await loadPrimaryKeys(schemaName)

    const targetColumns = allColumns
        .filter((c) => TEXT_DATA_TYPES.has(String(c.dataType || '').toLowerCase()))
        .filter((c) => args.tables.length === 0 || args.tables.includes(c.tableName))
        .filter((c) => shouldProcessColumn(c.columnName, args.includeAllTextColumns, args.columns))
        .filter((c) => c.tableName !== 'SequelizeMeta')
        .filter((c) => pkMap.has(c.tableName))

    if (!targetColumns.length) {
        console.log('[text-repair] No matching text columns found.')
        return
    }

    console.log(`[text-repair] Target columns: ${targetColumns.length}`)

    const startedAt = new Date().toISOString()
    const perColumn = []
    const totals = {
        candidates: 0,
        repaired: 0,
        unrecoverable: 0,
        unchanged: 0
    }

    for (const col of targetColumns) {
        const pkColumns = pkMap.get(col.tableName)
        const result = await processColumn({
            tableName: col.tableName,
            columnName: col.columnName,
            pkColumns,
            apply: args.apply,
            batchSize: args.batchSize,
            maxPasses: args.maxPasses,
            verbose: args.verbose
        })

        perColumn.push(result)
        totals.candidates += result.candidates
        totals.repaired += result.repaired
        totals.unrecoverable += result.unrecoverable
        totals.unchanged += result.unchanged

        if (result.candidates > 0) {
            console.log(
                `[text-repair] ${col.tableName}.${col.columnName}: ` +
                `candidates=${result.candidates}, repaired=${result.repaired}, ` +
                `unrecoverable=${result.unrecoverable}, unchanged=${result.unchanged}`
            )
        }
    }

    const report = {
        mode: args.apply ? 'apply' : 'dry-run',
        startedAt,
        finishedAt: new Date().toISOString(),
        database: schemaName,
        options: {
            tables: args.tables,
            columns: args.columns,
            includeAllTextColumns: args.includeAllTextColumns,
            batchSize: args.batchSize,
            maxPasses: args.maxPasses,
            verbose: args.verbose
        },
        totals,
        perColumn: perColumn.filter((x) => x.candidates > 0)
    }

    const reportPath = writeReport(report)

    console.log('')
    console.log('[text-repair] Summary')
    console.log(`  candidates:    ${totals.candidates}`)
    console.log(`  repaired:      ${totals.repaired}`)
    console.log(`  unrecoverable: ${totals.unrecoverable}`)
    console.log(`  unchanged:     ${totals.unchanged}`)
    console.log(`  report:        ${reportPath}`)

    if (!args.apply) {
        console.log('')
        console.log('[text-repair] Dry-run complete. Re-run with --apply to persist fixes.')
    }
}

main()
    .catch((error) => {
        console.error('[text-repair] Failed:', error.message)
        process.exitCode = 1
    })
    .finally(async () => {
        try {
            await sequelize.close()
        } catch (_) {
            // ignore
        }
    })
