/**
 * Generate COA Financial UAT Evidence Pack
 *
 * Purpose:
 *   Produce a structured PASS/FAIL evidence report for financial UAT sign-off
 *   after COA Header/Subaccounts cutover.
 *
 * Usage:
 *   node src/scripts/generate-coa-uat-evidence.js --cutover=2026-02-24
 *   node src/scripts/generate-coa-uat-evidence.js --cutover=2026-02-24 --periodFrom=2026-02 --periodTo=2026-02
 *   node src/scripts/generate-coa-uat-evidence.js --cutover=2026-02-24 --periodTo=2026-03 --branchId=<UUID>
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, Account } = require('../models')
const AccountingService = require('../services/accountingService')

const argv = process.argv.slice(2)
const cutoverArg = argv.find((a) => a.startsWith('--cutover=')) || ''
const periodFromArg = argv.find((a) => a.startsWith('--periodFrom=')) || ''
const periodToArg = argv.find((a) => a.startsWith('--periodTo=')) || ''
const branchIdArg = argv.find((a) => a.startsWith('--branchId=')) || ''

const CUTOVER_DATE = cutoverArg.split('=')[1] || '2026-02-24'
const PERIOD_FROM = periodFromArg.split('=')[1] || null
const PERIOD_TO = periodToArg.split('=')[1] || null
const BRANCH_ID = branchIdArg.split('=')[1] || null

function assertDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error(`Invalid cutover date: ${dateStr}. Expected YYYY-MM-DD`)
    }
}

function assertPeriodOrNull(periodStr, fieldName) {
    if (!periodStr) return
    if (!/^\d{4}-\d{2}$/.test(periodStr)) {
        throw new Error(`Invalid ${fieldName}: ${periodStr}. Expected YYYY-MM`)
    }
}

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function asNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

function round2(value) {
    return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100
}

function passFailRow(id, name, passed, details) {
    return {
        id,
        name,
        status: passed ? 'PASS' : 'FAIL',
        passed: !!passed,
        details
    }
}

function toMarkdown(result) {
    const lines = []
    lines.push('# COA Financial UAT Evidence')
    lines.push('## Header/Subaccounts Cutover Sign-off Pack')
    lines.push('')
    lines.push(`- Generated At: ${result.generated_at}`)
    lines.push(`- Cutover Date: ${result.cutover_date}`)
    lines.push(`- Scope Period: ${result.scope.periodFrom || '-'} to ${result.scope.periodTo || '-'}`)
    lines.push(`- Scope Branch: ${result.scope.branchId || 'ALL'}`)
    lines.push('')
    lines.push('## Summary')
    lines.push('')
    lines.push(`- Total Checks: ${result.summary.total_checks}`)
    lines.push(`- Passed: ${result.summary.passed}`)
    lines.push(`- Failed: ${result.summary.failed}`)
    lines.push(`- Pass Rate: ${result.summary.pass_rate}%`)
    lines.push(`- Overall Status: **${result.summary.overall_status}**`)
    lines.push('')
    lines.push('## Check Matrix')
    lines.push('')
    lines.push('| ID | Check | Status | Key Result |')
    lines.push('|---|---|---|---|')

    for (const check of result.checks) {
        let keyResult = ''
        if (typeof check.details.value !== 'undefined') {
            keyResult = `${check.details.value}`
        } else if (typeof check.details.note === 'string') {
            keyResult = check.details.note
        } else {
            keyResult = '-'
        }
        lines.push(`| ${check.id} | ${check.name} | ${check.status} | ${keyResult} |`)
    }

    lines.push('')
    lines.push('## Detailed Evidence')
    lines.push('')
    for (const check of result.checks) {
        lines.push(`### ${check.id} — ${check.name}`)
        lines.push(`- Status: ${check.status}`)
        for (const [key, value] of Object.entries(check.details)) {
            if (Array.isArray(value)) {
                lines.push(`- ${key}: ${value.length} item(s)`)
            } else if (value !== null && typeof value === 'object') {
                lines.push(`- ${key}: ${JSON.stringify(value)}`)
            } else {
                lines.push(`- ${key}: ${value}`)
            }
        }
        lines.push('')
    }

    return `${lines.join('\n')}\n`
}

async function checkHeaderLinesAfterCutover() {
    const [rows] = await sequelize.query(`
        SELECT
            COUNT(*) AS violating_lines,
            COUNT(DISTINCT je.id) AS violating_entries
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        WHERE je.status = 'posted'
          AND a.is_group = 1
          AND je.entry_date >= :cutoverDate
          AND (:branchId IS NULL OR je.branch_id = :branchId)
    `, {
        replacements: { cutoverDate: CUTOVER_DATE, branchId: BRANCH_ID }
    })

    const violatingLines = asNumber(rows?.[0]?.violating_lines)
    const violatingEntries = asNumber(rows?.[0]?.violating_entries)

    return passFailRow(
        'AC-01',
        'No posted lines on Header accounts after cutover',
        violatingLines === 0,
        {
            value: violatingLines,
            violating_entries: violatingEntries,
            expected: 0
        }
    )
}

async function checkDefaultMappingsOnPostingAccounts() {
    const [rows] = await sequelize.query(`
        SELECT COUNT(*) AS invalid_defaults
        FROM gl_account_defaults ad
        LEFT JOIN gl_accounts a ON a.id = ad.account_id
        WHERE ad.is_active = 1
          AND (
            a.id IS NULL
            OR a.is_active = 0
            OR a.is_group = 1
          )
    `)

    const invalidDefaults = asNumber(rows?.[0]?.invalid_defaults)
    return passFailRow(
        'AC-02',
        'All active gl_account_defaults point to active posting accounts',
        invalidDefaults === 0,
        {
            value: invalidDefaults,
            expected: 0
        }
    )
}

async function checkTrialBalanceBalanced() {
    const trialBalance = await AccountingService.getTrialBalance({
        periodFrom: PERIOD_FROM,
        periodTo: PERIOD_TO,
        branchId: BRANCH_ID
    })

    const totalDebits = round2(trialBalance.globalTotals?.totalDebits)
    const totalCredits = round2(trialBalance.globalTotals?.totalCredits)
    const diff = round2(totalDebits - totalCredits)

    return passFailRow(
        'AC-03',
        'Trial Balance is balanced (global debits = credits)',
        Math.abs(diff) < 0.005,
        {
            value: diff,
            total_debits: totalDebits,
            total_credits: totalCredits,
            expected: 0
        }
    )
}

async function checkBalanceSheetBalanced() {
    const today = new Date()
    const defaultPeriodTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    const asOfDate = PERIOD_TO || defaultPeriodTo

    const balanceSheet = await AccountingService.getBalanceSheet({
        asOfDate,
        branchId: BRANCH_ID
    })

    const assets = round2(balanceSheet.assets?.total)
    const liabilitiesAndEquity = round2(balanceSheet.totalLiabilitiesAndEquity)
    const diff = round2(assets - liabilitiesAndEquity)

    return passFailRow(
        'AC-04',
        'Balance Sheet is balanced (Assets = Liabilities + Equity)',
        Math.abs(diff) < 0.005 && balanceSheet.balanced === true,
        {
            value: diff,
            assets_total: assets,
            liabilities_plus_equity_total: liabilitiesAndEquity,
            expected: 0
        }
    )
}

async function checkTaxClassification() {
    const [in1300, in2100] = await Promise.all([
        Account.findOne({ where: { code: '1300' } }),
        Account.findOne({ where: { code: '2100' } })
    ])

    const details = {
        account_1300: in1300 ? {
            code: in1300.code,
            root_type: in1300.root_type,
            account_type: in1300.account_type,
            normal_balance: in1300.normal_balance,
            is_group: !!in1300.is_group,
            is_active: !!in1300.is_active
        } : null,
        account_2100: in2100 ? {
            code: in2100.code,
            root_type: in2100.root_type,
            account_type: in2100.account_type,
            normal_balance: in2100.normal_balance,
            is_group: !!in2100.is_group,
            is_active: !!in2100.is_active
        } : null
    }

    const passed =
        !!in1300 &&
        !!in2100 &&
        in1300.root_type === 'asset' &&
        in1300.normal_balance === 'debit' &&
        in1300.is_active === true &&
        in2100.root_type === 'liability' &&
        in2100.normal_balance === 'credit' &&
        in2100.is_active === true

    return passFailRow(
        'AC-05',
        'Tax separation is valid (1300 Asset/Dr, 2100 Liability/Cr)',
        passed,
        {
            value: passed ? 1 : 0,
            ...details
        }
    )
}

async function checkInterBranchClearingZero() {
    const [rows] = await sequelize.query(`
        SELECT
            COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) AS net_balance
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        JOIN gl_accounts a ON a.id = jl.account_id
        WHERE je.status = 'posted'
          AND (a.code = '1105' OR a.code LIKE '1105-%')
          AND (:periodFrom IS NULL OR je.fiscal_period >= :periodFrom)
          AND (:periodTo IS NULL OR je.fiscal_period <= :periodTo)
          AND (:branchId IS NULL OR je.branch_id = :branchId)
    `, {
        replacements: {
            periodFrom: PERIOD_FROM,
            periodTo: PERIOD_TO,
            branchId: BRANCH_ID
        }
    })

    const netBalance = round2(rows?.[0]?.net_balance)
    const passed = Math.abs(netBalance) < 0.005

    return passFailRow(
        'AC-06',
        'Inter-branch clearing account family 1105 ends at zero balance',
        passed,
        {
            value: netBalance,
            expected: 0
        }
    )
}

async function checkCutoverAuditEvent() {
    const [rows] = await sequelize.query(`
        SELECT COUNT(*) AS event_count
        FROM gl_audit_logs
        WHERE event_type = 'coa_cutover_adopted'
          AND source_id = :sourceId
    `, {
        replacements: { sourceId: `coa_cutover:${CUTOVER_DATE}` }
    })

    const eventCount = asNumber(rows?.[0]?.event_count)
    return passFailRow(
        'AC-07',
        'Cutover adoption event exists in GL audit log',
        eventCount > 0,
        {
            value: eventCount,
            expected_min: 1
        }
    )
}

async function run() {
    assertDate(CUTOVER_DATE)
    assertPeriodOrNull(PERIOD_FROM, 'periodFrom')
    assertPeriodOrNull(PERIOD_TO, 'periodTo')

    try {
        const checks = []
        checks.push(await checkHeaderLinesAfterCutover())
        checks.push(await checkDefaultMappingsOnPostingAccounts())
        checks.push(await checkTrialBalanceBalanced())
        checks.push(await checkBalanceSheetBalanced())
        checks.push(await checkTaxClassification())
        checks.push(await checkInterBranchClearingZero())
        checks.push(await checkCutoverAuditEvent())

        const passed = checks.filter((c) => c.passed).length
        const failed = checks.length - passed
        const passRate = round2((passed / checks.length) * 100)

        const result = {
            generated_at: new Date().toISOString(),
            cutover_date: CUTOVER_DATE,
            scope: {
                periodFrom: PERIOD_FROM,
                periodTo: PERIOD_TO,
                branchId: BRANCH_ID
            },
            checks,
            summary: {
                total_checks: checks.length,
                passed,
                failed,
                pass_rate: passRate,
                overall_status: failed === 0 ? 'PASS' : 'FAIL'
            }
        }

        const reportsDir = path.join(__dirname, '../../reports')
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

        const stamp = nowStamp()
        const jsonPath = path.join(reportsDir, `coa-financial-uat-evidence-${stamp}.json`)
        const mdPath = path.join(reportsDir, `coa-financial-uat-evidence-${stamp}.md`)

        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8')
        fs.writeFileSync(mdPath, toMarkdown(result), 'utf8')

        console.log('\n=== COA Financial UAT Evidence ===')
        console.log(JSON.stringify(result.summary, null, 2))
        console.log(`json: ${jsonPath}`)
        console.log(`md: ${mdPath}`)
        console.log('=== End ===\n')

        if (failed > 0) process.exitCode = 2
    } catch (error) {
        console.error('Failed to generate COA financial UAT evidence:', error.message)
        process.exitCode = 1
    } finally {
        await sequelize.close()
    }
}

if (require.main === module) {
    run()
}

module.exports = { run }

