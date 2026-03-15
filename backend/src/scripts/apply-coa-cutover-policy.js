/**
 * Apply COA Cutover Policy
 *
 * Accounting recommendation (cutover strategy):
 * - Keep historical header postings as legacy evidence (do not reclassify immediately).
 * - Enforce that no new postings to header accounts exist from cutover date forward.
 *
 * What this script does:
 * 1) Scans posted journal lines on header accounts.
 * 2) Splits them into legacy (< cutover date) and violations (>= cutover date).
 * 3) In --apply mode:
 *    - Tags legacy journal entries in notes for audit traceability.
 *    - Records policy adoption event in gl_audit_logs.
 * 4) Writes a JSON report under backend/reports.
 *
 * Usage:
 *   node src/scripts/apply-coa-cutover-policy.js --cutover=2026-02-24
 *   node src/scripts/apply-coa-cutover-policy.js --cutover=2026-02-24 --apply
 *   node src/scripts/apply-coa-cutover-policy.js --cutover=2026-02-24 --apply --force
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, JournalEntry } = require('../models')
const GLAuditService = require('../services/glAuditService')

const args = new Set(process.argv.slice(2))
const cutoverArg = process.argv.find((x) => x.startsWith('--cutover=')) || ''
const CUTOVER_DATE = cutoverArg.split('=')[1] || null
const APPLY = args.has('--apply')
const FORCE = args.has('--force')

function assertDate(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Invalid or missing --cutover=YYYY-MM-DD')
    }
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    if (Number.isNaN(d.getTime())) {
        throw new Error(`Invalid cutover date: ${dateStr}`)
    }
}

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

async function loadHeaderPostingLines(transaction) {
    const [rows] = await sequelize.query(`
        SELECT
            jl.id AS journal_line_id,
            je.id AS journal_entry_id,
            je.entry_number,
            je.entry_date,
            je.fiscal_period,
            je.source_type,
            je.source_id,
            je.branch_id,
            je.notes,
            a.code AS account_code,
            a.name_ar AS account_name_ar,
            jl.debit_amount,
            jl.credit_amount
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        WHERE je.status = 'posted'
          AND a.is_header = 1
        ORDER BY je.entry_date ASC, je.entry_number ASC, jl.line_number ASC
    `, { transaction })

    return rows
}

function splitByCutover(rows, cutoverDate) {
    const legacy = []
    const violations = []

    for (const row of rows) {
        const entryDate = String(row.entry_date || '').slice(0, 10)
        if (entryDate && entryDate < cutoverDate) legacy.push(row)
        else violations.push(row)
    }

    return { legacy, violations }
}

async function tagLegacyEntries(legacyRows, cutoverDate, transaction) {
    const marker = `[COA_CUTOVER_LEGACY_HEADER_LINE|cutover:${cutoverDate}]`
    const seen = new Set()
    let tagged = 0
    let alreadyTagged = 0

    for (const row of legacyRows) {
        if (seen.has(row.journal_entry_id)) continue
        seen.add(row.journal_entry_id)

        const existingNotes = row.notes || ''
        if (existingNotes.includes(marker)) {
            alreadyTagged++
            continue
        }

        const nextNotes = existingNotes
            ? `${existingNotes}\n${marker}`
            : marker

        await JournalEntry.update(
            { notes: nextNotes },
            { where: { id: row.journal_entry_id }, transaction }
        )
        tagged++
    }

    return { tagged, alreadyTagged, marker, uniqueEntries: seen.size }
}

function buildSummary({ cutoverDate, apply, force, allRows, legacyRows, violationRows, tagging }) {
    return {
        cutover_date: cutoverDate,
        mode: apply ? 'APPLY' : 'DRY_RUN',
        force,
        totals: {
            header_lines_total: allRows.length,
            legacy_header_lines: legacyRows.length,
            post_cutover_header_lines: violationRows.length,
            legacy_journal_entries: new Set(legacyRows.map((r) => r.journal_entry_id)).size,
            post_cutover_journal_entries: new Set(violationRows.map((r) => r.journal_entry_id)).size
        },
        tagging
    }
}

function writeReport(summary, legacyRows, violationRows) {
    const reportsDir = path.join(__dirname, '../../reports')
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

    const stamp = nowStamp()
    const reportPath = path.join(reportsDir, `coa-cutover-policy-${stamp}.json`)
    const payload = {
        summary,
        sample_legacy_lines: legacyRows.slice(0, 200),
        sample_post_cutover_violations: violationRows.slice(0, 200)
    }

    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8')
    return reportPath
}

async function run() {
    assertDate(CUTOVER_DATE)

    const tx = await sequelize.transaction()
    try {
        const allRows = await loadHeaderPostingLines(tx)
        const { legacy, violations } = splitByCutover(allRows, CUTOVER_DATE)

        let tagging = {
            marker: `[COA_CUTOVER_LEGACY_HEADER_LINE|cutover:${CUTOVER_DATE}]`,
            tagged: 0,
            alreadyTagged: 0,
            uniqueEntries: 0
        }

        if (APPLY) {
            if (violations.length > 0 && !FORCE) {
                throw new Error(
                    `Cutover validation failed: found ${violations.length} header line(s) ` +
                    `on/after ${CUTOVER_DATE}. Use --force only if approved by audit lead.`
                )
            }

            tagging = await tagLegacyEntries(legacy, CUTOVER_DATE, tx)

            await GLAuditService.log({
                eventType: 'coa_cutover_adopted',
                sourceType: 'policy',
                sourceId: `coa_cutover:${CUTOVER_DATE}`,
                fiscalPeriod: CUTOVER_DATE.slice(0, 7),
                payload: {
                    cutover_date: CUTOVER_DATE,
                    header_lines_total: allRows.length,
                    legacy_header_lines: legacy.length,
                    post_cutover_header_lines: violations.length,
                    tagging
                }
            }, { transaction: tx })
        }

        const summary = buildSummary({
            cutoverDate: CUTOVER_DATE,
            apply: APPLY,
            force: FORCE,
            allRows,
            legacyRows: legacy,
            violationRows: violations,
            tagging
        })

        const reportPath = writeReport(summary, legacy, violations)

        if (APPLY) await tx.commit()
        else await tx.rollback()

        console.log('\n=== COA Cutover Policy ===')
        console.log(JSON.stringify(summary, null, 2))
        console.log(`report: ${reportPath}`)
        console.log('=== End ===\n')
    } catch (error) {
        await tx.rollback()
        console.error('Cutover policy failed:', error.message)
        process.exitCode = 1
    } finally {
        await sequelize.close()
    }
}

if (require.main === module) {
    run()
}

module.exports = { run }

