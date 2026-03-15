#!/usr/bin/env node
/**
 * Recover missing GL journal lines when headers exist but lines were deleted.
 *
 * Strategy:
 * 1) Rebuild lines from gl_audit_logs payload where available.
 * 2) Recreate orphan headers that have no payload (order/purchase/etc) from source records.
 * 3) Rebuild account balances and run supplier reconciliation.
 *
 * Usage:
 *   node src/scripts/recover-gl-journal-lines.js
 *   node src/scripts/recover-gl-journal-lines.js --dry-run
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { QueryTypes } = require('sequelize')
const {
    sequelize,
    Account,
    JournalEntry,
    JournalLine,
    GLAuditLog,
    PurchaseReturn,
    SupplierPayment,
    Shift
} = require('../models')
const AccountingHooks = require('../services/accountingHooks')
const AccountingService = require('../services/accountingService')

const EXPENSE_ACCOUNT_BY_CATEGORY = {
    rent: '5102',
    utilities: '5103',
    salaries: '5101',
    maintenance: '5105',
    marketing: '5104',
    supplies: '5100',
    transport: '5100',
    insurance: '5100',
    cleaning: '5100',
    taxes: '5100',
    other: '5100'
}

function parseArgs(argv) {
    return {
        dryRun: argv.includes('--dry-run')
    }
}

function num(v) {
    const n = parseFloat(v || 0)
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0
}

function tsFileStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

async function getCounts() {
    const [row] = await sequelize.query(
        `
        SELECT
          (SELECT COUNT(*) FROM gl_journal_entries) AS total_entries,
          (SELECT COUNT(*) FROM gl_journal_lines) AS total_lines,
          (SELECT COUNT(*) FROM gl_journal_entries je
            WHERE NOT EXISTS (SELECT 1 FROM gl_journal_lines jl WHERE jl.journal_entry_id = je.id)
          ) AS orphan_entries
        `,
        { type: QueryTypes.SELECT }
    )
    return {
        totalEntries: parseInt(row.total_entries || 0, 10),
        totalLines: parseInt(row.total_lines || 0, 10),
        orphanEntries: parseInt(row.orphan_entries || 0, 10)
    }
}

async function buildAccountCodeMap() {
    const accounts = await Account.findAll({
        attributes: ['id', 'code'],
        where: { is_active: true }
    })
    const map = {}
    for (const acc of accounts) {
        map[acc.code] = acc.id
    }
    return map
}

async function fetchOrphansWithLatestAuditPayload() {
    return sequelize.query(
        `
        SELECT
          je.id,
          je.entry_number,
          je.source_type,
          je.source_id,
          je.total_amount,
          al.payload
        FROM gl_journal_entries je
        LEFT JOIN gl_journal_lines jl
          ON jl.journal_entry_id = je.id
        INNER JOIN (
          SELECT source_type, source_id, entry_number, MAX(created_at) AS max_created
          FROM gl_audit_logs
          WHERE payload IS NOT NULL
          GROUP BY source_type, source_id, entry_number
        ) latest
          ON latest.source_type = je.source_type
         AND latest.source_id <=> je.source_id
         AND latest.entry_number = je.entry_number
        INNER JOIN gl_audit_logs al
          ON al.source_type = latest.source_type
         AND al.source_id <=> latest.source_id
         AND al.entry_number = latest.entry_number
         AND al.created_at = latest.max_created
        WHERE jl.id IS NULL
        `,
        { type: QueryTypes.SELECT }
    )
}

async function fetchOrphanEntriesByType() {
    return sequelize.query(
        `
        SELECT je.*
        FROM gl_journal_entries je
        LEFT JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
        WHERE jl.id IS NULL
        ORDER BY je.entry_number ASC
        `,
        { type: QueryTypes.SELECT }
    )
}

async function rebuildFromAuditPayload({ dryRun, accountMap, report }) {
    const rows = await fetchOrphansWithLatestAuditPayload()
    let rebuiltEntries = 0
    let rebuiltLines = 0
    const errors = []

    for (const row of rows) {
        let payload
        try {
            payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
        } catch (e) {
            errors.push({
                entry_number: row.entry_number,
                source_type: row.source_type,
                source_id: row.source_id,
                error: `Invalid payload JSON: ${e.message}`
            })
            continue
        }

        const payloadLines = Array.isArray(payload?.lines) ? payload.lines : []
        if (!payloadLines.length) {
            errors.push({
                entry_number: row.entry_number,
                source_type: row.source_type,
                source_id: row.source_id,
                error: 'No lines found in payload'
            })
            continue
        }

        const toCreate = []
        for (let i = 0; i < payloadLines.length; i++) {
            const line = payloadLines[i]
            const accountCode = String(line.account_code || line.accountCode || '').trim()
            const accountId = accountMap[accountCode]
            if (!accountCode || !accountId) {
                errors.push({
                    entry_number: row.entry_number,
                    source_type: row.source_type,
                    source_id: row.source_id,
                    error: `Unknown account code in payload: "${accountCode}"`
                })
                continue
            }

            toCreate.push({
                journal_entry_id: row.id,
                account_id: accountId,
                debit_amount: num(line.debit ?? line.debit_amount),
                credit_amount: num(line.credit ?? line.credit_amount),
                description: line.description || null,
                line_number: parseInt(line.line_number || i + 1, 10)
            })
        }

        if (!toCreate.length) continue

        if (!dryRun) {
            await JournalLine.bulkCreate(toCreate)
        }
        rebuiltEntries++
        rebuiltLines += toCreate.length
    }

    report.rebuildFromAudit = {
        candidates: rows.length,
        rebuiltEntries,
        rebuiltLines,
        errors
    }
}

async function deleteOrphanHeadersBySourceTypes({ dryRun, sourceTypes }) {
    if (!sourceTypes.length) return { deleted: 0, rows: [] }
    const rows = await sequelize.query(
        `
        SELECT je.*
        FROM gl_journal_entries je
        LEFT JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
        WHERE jl.id IS NULL
          AND je.source_type IN (:sourceTypes)
        ORDER BY je.entry_number ASC
        `,
        {
            replacements: { sourceTypes },
            type: QueryTypes.SELECT
        }
    )

    if (!dryRun && rows.length) {
        await JournalEntry.destroy({
            where: { id: rows.map(r => r.id) }
        })
    }

    return { deleted: rows.length, rows }
}

async function recreateOrdersAndReceipts({ dryRun, report }) {
    if (dryRun) {
        report.recreateOrdersAndReceipts = {
            orders: { skipped: true },
            purchaseReceipts: { skipped: true }
        }
        return
    }

    const orderRes = await AccountingHooks.backfillOrders({
        limit: 10000,
        estimateMissingCOGS: true
    })
    const receiptRes = await AccountingHooks.backfillPurchaseReceipts({ limit: 10000 })

    report.recreateOrdersAndReceipts = {
        orders: orderRes,
        purchaseReceipts: receiptRes
    }
}

async function recreatePurchaseReturns({ dryRun, deletedRows, report }) {
    const target = deletedRows.filter(r => r.source_type === 'purchase_return' && r.source_id)
    const result = { total: target.length, recreated: 0, missingSource: 0, errors: [] }

    for (const row of target) {
        const rec = await PurchaseReturn.findByPk(row.source_id)
        if (!rec) {
            result.missingSource++
            continue
        }
        if (dryRun) continue
        try {
            await AccountingService.recordPurchaseReturn(rec)
            result.recreated++
        } catch (e) {
            result.errors.push({ source_id: row.source_id, error: e.message })
        }
    }

    report.recreatePurchaseReturns = result
}

async function recreateSupplierPayments({ dryRun, deletedRows, report }) {
    const target = deletedRows.filter(r => r.source_type === 'supplier_payment' && r.source_id)
    const result = { total: target.length, recreated: 0, missingSource: 0, errors: [] }

    for (const row of target) {
        const rec = await SupplierPayment.findByPk(row.source_id)
        if (!rec) {
            result.missingSource++
            continue
        }
        if (dryRun) continue
        try {
            await AccountingService.recordSupplierPayment(rec)
            result.recreated++
        } catch (e) {
            result.errors.push({ source_id: row.source_id, error: e.message })
        }
    }

    report.recreateSupplierPayments = result
}

async function recreateShiftEntries({ dryRun, deletedRows, report }) {
    const target = deletedRows.filter(r => r.source_type === 'shift' && r.source_id)
    const result = { total: target.length, recreated: 0, missingSource: 0, errors: [] }

    for (const row of target) {
        const shiftId = parseInt(row.source_id, 10)
        if (!Number.isFinite(shiftId)) {
            result.errors.push({ source_id: row.source_id, error: 'Invalid shift id' })
            continue
        }
        const shift = await Shift.findByPk(shiftId)
        if (!shift) {
            result.missingSource++
            continue
        }
        if (dryRun) continue
        try {
            // Historical orphan seen in this environment is opening drawer entry.
            await AccountingService.recordDrawerOpening(
                shift.id,
                num(shift.starting_cash),
                { branchId: shift.branch_id, userId: shift.user_id }
            )
            result.recreated++
        } catch (e) {
            result.errors.push({ source_id: row.source_id, error: e.message })
        }
    }

    report.recreateShiftEntries = result
}

async function recreateExpenseEntries({ dryRun, deletedRows, report }) {
    const target = deletedRows.filter(r => r.source_type === 'expense')
    const result = { total: target.length, recreated: 0, errors: [] }

    for (const row of target) {
        const amount = num(row.total_amount)
        if (amount <= 0) continue

        let meta = {}
        try { meta = row.notes ? JSON.parse(row.notes) : {} } catch (_) { meta = {} }

        const category = String(meta.category || 'other')
        const paymentMethod = String(meta.payment_method || 'cash')
        const expenseAccountCode = EXPENSE_ACCOUNT_BY_CATEGORY[category] || '5100'
        const paymentAccountCode = paymentMethod === 'cash' ? '1001' : '1002'

        if (dryRun) continue
        try {
            await AccountingService.createJournalEntry({
                description: row.description || 'Recovered expense entry',
                sourceType: 'expense',
                sourceId: `recovered:${row.entry_number}`,
                entryDate: row.entry_date,
                branchId: row.branch_id || null,
                createdBy: row.created_by || null,
                notes: row.notes || JSON.stringify({ recovered_from_entry: row.entry_number }),
                lines: [
                    {
                        accountCode: expenseAccountCode,
                        debit: amount,
                        credit: 0,
                        description: row.description || 'Recovered expense debit'
                    },
                    {
                        accountCode: paymentAccountCode,
                        debit: 0,
                        credit: amount,
                        description: `Recovered expense payment (${paymentMethod})`
                    }
                ]
            })
            result.recreated++
        } catch (e) {
            result.errors.push({ entry_number: row.entry_number, error: e.message })
        }
    }

    report.recreateExpenseEntries = result
}

async function runPostRecoveryMaintenance({ dryRun, report }) {
    if (dryRun) {
        report.postMaintenance = { skipped: true }
        return
    }

    // Rebuild account balances (cache) from journal lines.
    await sequelize.query(
        `
        UPDATE gl_accounts a
        LEFT JOIN (
            SELECT
                a2.id AS account_id,
                COALESCE(SUM(
                    CASE
                        WHEN a2.normal_balance = 'debit'
                            THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                    END
                ), 0) AS ledger_balance
            FROM gl_accounts a2
            LEFT JOIN gl_journal_lines jl ON jl.account_id = a2.id
            LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
            WHERE a2.is_active = 1
            GROUP BY a2.id
        ) x ON x.account_id = a.id
        SET a.current_balance = COALESCE(x.ledger_balance, 0)
        WHERE a.is_active = 1
        `
    )

    const supplierRec = await AccountingService.reconcileAllSuppliers({ autoFix: true })
    report.postMaintenance = {
        supplierReconcile: supplierRec
    }
}

async function runValidation(report) {
    const counts = await getCounts()
    let trialBalance = {}
    let pl = {}
    try {
        const tb = await AccountingService.getTrialBalance({})
        trialBalance = {
            totalDebits: tb?.totals?.totalDebits || 0,
            totalCredits: tb?.totals?.totalCredits || 0,
            isBalanced: !!tb?.balanced,
            accountsCount: Array.isArray(tb.accounts) ? tb.accounts.length : 0
        }
    } catch (e) {
        trialBalance = { error: e.message }
    }

    try {
        const pnl = await AccountingService.getProfitAndLoss({})
        pl = {
            revenue: pnl.income?.total || 0,
            cogs: pnl.cogs?.total || 0,
            grossProfit: pnl.grossProfit || 0,
            netIncome: pnl.netIncome || 0
        }
    } catch (e) {
        pl = { error: e.message }
    }

    report.validation = { counts, trialBalance, profitAndLoss: pl }
}

async function main() {
    const args = parseArgs(process.argv)
    const report = {
        executedAt: new Date().toISOString(),
        mode: args.dryRun ? 'dry-run' : 'apply',
        before: null
    }

    await sequelize.authenticate()
    report.before = await getCounts()

    const accountMap = await buildAccountCodeMap()

    // Phase 1: direct recovery from audit payload
    await rebuildFromAuditPayload({ dryRun: args.dryRun, accountMap, report })

    // Phase 2: regenerate remaining orphan headers by source logic
    const deleted = await deleteOrphanHeadersBySourceTypes({
        dryRun: args.dryRun,
        sourceTypes: ['order', 'purchase_receipt', 'purchase_return', 'supplier_payment', 'shift', 'expense']
    })
    report.deletedOrphanHeaders = {
        total: deleted.deleted,
        byType: deleted.rows.reduce((acc, r) => {
            acc[r.source_type] = (acc[r.source_type] || 0) + 1
            return acc
        }, {})
    }

    await recreateOrdersAndReceipts({ dryRun: args.dryRun, report })
    await recreatePurchaseReturns({ dryRun: args.dryRun, deletedRows: deleted.rows, report })
    await recreateSupplierPayments({ dryRun: args.dryRun, deletedRows: deleted.rows, report })
    await recreateShiftEntries({ dryRun: args.dryRun, deletedRows: deleted.rows, report })
    await recreateExpenseEntries({ dryRun: args.dryRun, deletedRows: deleted.rows, report })
    await runPostRecoveryMaintenance({ dryRun: args.dryRun, report })

    report.after = await getCounts()
    await runValidation(report)

    const outDir = path.join(__dirname, '../../reports')
    fs.mkdirSync(outDir, { recursive: true })
    const outFile = path.join(outDir, `gl-lines-recovery-${tsFileStamp()}.json`)
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')

    console.log(JSON.stringify(report, null, 2))
    console.log(`Recovery report: ${outFile}`)

    await sequelize.close()
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(async (err) => {
            console.error('GL recovery failed:', err)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}
