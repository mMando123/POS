/**
 * Check COA Cutover Compliance
 *
 * Verifies that no posted journal lines hit header accounts on/after cutover date.
 *
 * Usage:
 *   node src/scripts/check-coa-cutover-compliance.js --cutover=2026-02-24
 *   node src/scripts/check-coa-cutover-compliance.js --cutover=2026-02-24 --strict
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')

const args = new Set(process.argv.slice(2))
const cutoverArg = process.argv.find((x) => x.startsWith('--cutover=')) || ''
const CUTOVER_DATE = cutoverArg.split('=')[1] || '2026-02-24'
const STRICT = args.has('--strict')

function assertDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error(`Invalid cutover date format: ${dateStr}. Expected YYYY-MM-DD`)
    }
}

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

async function run() {
    assertDate(CUTOVER_DATE)

    try {
        const [summaryRows] = await sequelize.query(`
            SELECT
                COUNT(*) AS violating_lines,
                COUNT(DISTINCT je.id) AS violating_entries
            FROM gl_journal_lines jl
            JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
            JOIN gl_accounts a ON a.id = jl.account_id
            WHERE je.status = 'posted'
              AND a.is_header = 1
              AND je.entry_date >= :cutoverDate
        `, { replacements: { cutoverDate: CUTOVER_DATE } })

        const [detailRows] = await sequelize.query(`
            SELECT
                DATE_FORMAT(je.entry_date, '%Y-%m') AS period,
                a.code AS account_code,
                COUNT(*) AS lines_count,
                COUNT(DISTINCT je.id) AS entries_count
            FROM gl_journal_lines jl
            JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
            JOIN gl_accounts a ON a.id = jl.account_id
            WHERE je.status = 'posted'
              AND a.is_header = 1
              AND je.entry_date >= :cutoverDate
            GROUP BY DATE_FORMAT(je.entry_date, '%Y-%m'), a.code
            ORDER BY period ASC, a.code ASC
        `, { replacements: { cutoverDate: CUTOVER_DATE } })

        const violatingLines = Number(summaryRows?.[0]?.violating_lines || 0)
        const violatingEntries = Number(summaryRows?.[0]?.violating_entries || 0)

        const result = {
            cutover_date: CUTOVER_DATE,
            compliant: violatingLines === 0,
            violating_lines: violatingLines,
            violating_entries: violatingEntries,
            details: detailRows
        }

        const reportsDir = path.join(__dirname, '../../reports')
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
        const reportPath = path.join(reportsDir, `coa-cutover-compliance-${nowStamp()}.json`)
        fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8')

        console.log('\n=== COA Cutover Compliance ===')
        console.log(JSON.stringify(result, null, 2))
        console.log(`report: ${reportPath}`)
        console.log('=== End ===\n')

        if (STRICT && violatingLines > 0) {
            process.exitCode = 2
        }
    } catch (error) {
        console.error('Compliance check failed:', error.message)
        process.exitCode = 1
    } finally {
        await sequelize.close()
    }
}

if (require.main === module) {
    run()
}

module.exports = { run }

