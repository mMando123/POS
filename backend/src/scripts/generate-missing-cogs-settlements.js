/**
 * Generate settlement proposals for completed orders missing COGS journal entries.
 *
 * Output files:
 *  - JSON: full machine-readable proposals
 *  - CSV: quick spreadsheet analysis
 *  - MD: human-readable report
 *
 * Run:
 *   node src/scripts/generate-missing-cogs-settlements.js
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')
const { QueryTypes } = require('sequelize')
const AccountingService = require('../services/accountingService')
const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')

function round2(value) {
    return Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100
}

function safeNum(value) {
    const n = parseFloat(value || 0)
    return Number.isFinite(n) ? n : 0
}

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

function median(values) {
    if (!values || values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2
    }
    return sorted[mid]
}

async function getMissingOrders() {
    return sequelize.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.branch_id,
            o.user_id,
            o.total,
            o.payment_status,
            o.completed_at,
            o.created_at
        FROM orders o
        LEFT JOIN gl_journal_entries je
            ON je.source_type = 'order_cogs'
           AND je.source_id = o.id
           AND je.status = 'posted'
        WHERE o.status = 'completed'
          AND o.payment_status IN ('paid', 'refunded', 'partially_refunded')
          AND EXISTS (
              SELECT 1
              FROM stock_movements sm
              WHERE sm.source_type = 'order'
                AND sm.source_id = o.id
          )
          AND je.id IS NULL
        ORDER BY o.completed_at ASC
        `,
        { type: QueryTypes.SELECT }
    )
}

async function getCogsRatioBenchmarks() {
    const branchRows = await sequelize.query(
        `
        SELECT
            o.branch_id,
            COUNT(*) AS sample_count,
            AVG(
                CASE
                    WHEN s.total_amount > 0 THEN (c.total_amount / s.total_amount)
                    ELSE NULL
                END
            ) AS avg_ratio
        FROM orders o
        JOIN gl_journal_entries s
            ON s.source_type = 'order'
           AND s.source_id = o.id
           AND s.status = 'posted'
        JOIN gl_journal_entries c
            ON c.source_type = 'order_cogs'
           AND c.source_id = o.id
           AND c.status = 'posted'
        WHERE o.status = 'completed'
          AND o.payment_status IN ('paid', 'refunded', 'partially_refunded')
          AND s.total_amount > 0
          AND c.total_amount >= 0
        GROUP BY o.branch_id
        `,
        { type: QueryTypes.SELECT }
    )

    const globalRows = await sequelize.query(
        `
        SELECT
            COUNT(*) AS sample_count,
            AVG(
                CASE
                    WHEN s.total_amount > 0 THEN (c.total_amount / s.total_amount)
                    ELSE NULL
                END
            ) AS avg_ratio
        FROM orders o
        JOIN gl_journal_entries s
            ON s.source_type = 'order'
           AND s.source_id = o.id
           AND s.status = 'posted'
        JOIN gl_journal_entries c
            ON c.source_type = 'order_cogs'
           AND c.source_id = o.id
           AND c.status = 'posted'
        WHERE o.status = 'completed'
          AND o.payment_status IN ('paid', 'refunded', 'partially_refunded')
          AND s.total_amount > 0
          AND c.total_amount >= 0
        `,
        { type: QueryTypes.SELECT }
    )

    const byBranch = {}
    for (const row of branchRows) {
        byBranch[row.branch_id] = {
            sampleCount: parseInt(row.sample_count || 0, 10),
            avgRatio: safeNum(row.avg_ratio)
        }
    }

    const global = {
        sampleCount: parseInt(globalRows[0]?.sample_count || 0, 10),
        avgRatio: safeNum(globalRows[0]?.avg_ratio)
    }

    return { byBranch, global }
}

async function getHistoricalOrderTotalMedian() {
    const rows = await sequelize.query(
        `
        SELECT o.total
        FROM orders o
        WHERE o.status = 'completed'
          AND o.payment_status IN ('paid', 'refunded', 'partially_refunded')
          AND o.total > 0
        ORDER BY o.completed_at ASC
        `,
        { type: QueryTypes.SELECT }
    )

    const totals = rows.map(r => safeNum(r.total)).filter(v => v > 0)
    return median(totals)
}

async function buildProposals() {
    const missingOrders = await getMissingOrders()
    const benchmarks = await getCogsRatioBenchmarks()
    const medianOrderTotal = await getHistoricalOrderTotalMedian()
    const outlierThreshold = Math.max(5000, medianOrderTotal * 20)

    const proposals = []
    let totalProposed = 0
    let dataEstimatedCount = 0
    let ratioEstimatedCount = 0
    let unresolvedCount = 0
    let outlierCount = 0

    for (const order of missingOrders) {
        const orderObj = {
            id: order.id,
            branch_id: order.branch_id,
            user_id: order.user_id,
            order_number: order.order_number,
            completed_at: order.completed_at,
            created_at: order.created_at
        }

        const estimate = await AccountingService._estimateHistoricalCOGS(orderObj, {
            estimationMethod: 'menu_cost_price_then_stock_avg_then_last_purchase'
        })

        const branchBenchmark = benchmarks.byBranch[order.branch_id]
        const branchRatioUsable = branchBenchmark && branchBenchmark.sampleCount >= 10 && branchBenchmark.avgRatio > 0
        const globalRatioUsable = benchmarks.global.sampleCount > 0 && benchmarks.global.avgRatio > 0

        const orderTotal = round2(order.total)
        let proposalAmount = 0
        let method = 'unresolved'
        let confidence = 'low'
        let ratioUsed = null
        let note = ''
        let anomalyFlag = null

        if (orderTotal >= outlierThreshold) {
            outlierCount++
            unresolvedCount++
            anomalyFlag = 'OUTLIER_ORDER_TOTAL'
            method = 'manual_review_outlier'
            confidence = 'very_low'
            note = `Outlier order total (${orderTotal}) exceeds threshold (${round2(outlierThreshold)}). Manual review required before settlement.`
        } else if (estimate.totalCOGS > 0) {
            proposalAmount = round2(estimate.totalCOGS)
            method = 'data_estimate'
            confidence = estimate.missingCostItems > 0 ? 'medium' : 'high'
            note = `Estimated from historical cost data. costed_items=${estimate.costedItems}, missing_cost_items=${estimate.missingCostItems}`
            dataEstimatedCount++
        } else if (branchRatioUsable || globalRatioUsable) {
            ratioUsed = branchRatioUsable ? branchBenchmark.avgRatio : benchmarks.global.avgRatio
            proposalAmount = round2(orderTotal * ratioUsed)
            method = branchRatioUsable ? 'ratio_estimate_branch' : 'ratio_estimate_global'
            confidence = 'low'
            note = branchRatioUsable
                ? `No direct cost data. Used branch historical COGS ratio (${round2(ratioUsed * 100)}%).`
                : `No direct cost data. Used global historical COGS ratio (${round2(ratioUsed * 100)}%).`
            ratioEstimatedCount++
        } else {
            unresolvedCount++
            note = 'No direct cost data and no usable historical ratio benchmark.'
        }

        let cogsAccount = '5001'
        let inventoryAccount = '1100'
        try {
            const accts = await AccountResolver.resolveMany({
                cogs: ACCOUNT_KEYS.COGS,
                inventory: ACCOUNT_KEYS.INVENTORY
            }, { branchId: order.branch_id })
            cogsAccount = accts.cogs || cogsAccount
            inventoryAccount = accts.inventory || inventoryAccount
        } catch (_) {
            // Keep legacy fallback codes in proposal output.
        }

        if (proposalAmount > 0) {
            totalProposed = round2(totalProposed + proposalAmount)
        }

        proposals.push({
            order_id: order.id,
            order_number: order.order_number,
            branch_id: order.branch_id,
            payment_status: order.payment_status,
            completed_at: order.completed_at,
            order_total: orderTotal,
            proposed_cogs_amount: proposalAmount,
            method,
            confidence,
            anomaly_flag: anomalyFlag,
            ratio_used: ratioUsed ? round2(ratioUsed * 100) : null,
            estimation_method: estimate.method || null,
            costed_items: estimate.costedItems || 0,
            missing_cost_items: estimate.missingCostItems || 0,
            proposed_journal: proposalAmount > 0 ? {
                description: `Historical COGS settlement for order ${order.order_number}`,
                source_type: 'order_cogs_settlement_proposal',
                source_id: order.id,
                entry_date: order.completed_at ? String(order.completed_at).slice(0, 10) : null,
                lines: [
                    { account_code: cogsAccount, debit: proposalAmount, credit: 0, description: `COGS settlement for ${order.order_number}` },
                    { account_code: inventoryAccount, debit: 0, credit: proposalAmount, description: `Inventory reduction for ${order.order_number}` }
                ]
            } : null,
            note
        })
    }

    return {
        generated_at: new Date().toISOString(),
        totals: {
            orders_missing_cogs: missingOrders.length,
            proposals_with_amount: proposals.filter(p => p.proposed_cogs_amount > 0).length,
            data_estimate_count: dataEstimatedCount,
            ratio_estimate_count: ratioEstimatedCount,
            unresolved_count: unresolvedCount,
            outlier_count: outlierCount,
            total_proposed_cogs_amount: totalProposed
        },
        benchmarks: {
            global_ratio_percent: round2((benchmarks.global.avgRatio || 0) * 100),
            global_sample_count: benchmarks.global.sampleCount,
            median_order_total_missing_cogs: round2(medianOrderTotal),
            outlier_threshold: round2(outlierThreshold),
            branch: benchmarks.byBranch
        },
        proposals
    }
}

function buildCsv(report) {
    const headers = [
        'order_id',
        'order_number',
        'branch_id',
        'payment_status',
        'completed_at',
        'order_total',
        'proposed_cogs_amount',
        'method',
        'confidence',
        'anomaly_flag',
        'ratio_used_percent',
        'estimation_method',
        'costed_items',
        'missing_cost_items',
        'cogs_account',
        'inventory_account',
        'note'
    ]

    const lines = [headers.join(',')]
    for (const p of report.proposals) {
        lines.push([
            p.order_id,
            p.order_number,
            p.branch_id,
            p.payment_status,
            p.completed_at,
            p.order_total,
            p.proposed_cogs_amount,
            p.method,
            p.confidence,
            p.anomaly_flag,
            p.ratio_used,
            p.estimation_method,
            p.costed_items,
            p.missing_cost_items,
            p.proposed_journal?.lines?.[0]?.account_code || '',
            p.proposed_journal?.lines?.[1]?.account_code || '',
            p.note
        ].map(csvEscape).join(','))
    }
    return lines.join('\n')
}

function buildMarkdown(report) {
    const lines = []
    lines.push('# Missing COGS Settlement Proposals')
    lines.push('')
    lines.push(`Generated at: ${report.generated_at}`)
    lines.push('')
    lines.push('## Summary')
    lines.push('')
    lines.push(`- Orders missing COGS: **${report.totals.orders_missing_cogs}**`)
    lines.push(`- Proposals with amount: **${report.totals.proposals_with_amount}**`)
    lines.push(`- Data-estimated proposals: **${report.totals.data_estimate_count}**`)
    lines.push(`- Ratio-estimated proposals: **${report.totals.ratio_estimate_count}**`)
    lines.push(`- Unresolved proposals: **${report.totals.unresolved_count}**`)
    lines.push(`- Outlier orders (manual review): **${report.totals.outlier_count}**`)
    lines.push(`- Total proposed COGS adjustment: **${report.totals.total_proposed_cogs_amount}**`)
    lines.push(`- Global ratio benchmark: **${report.benchmarks.global_ratio_percent}%** (sample: ${report.benchmarks.global_sample_count})`)
    lines.push(`- Median order total (missing COGS set): **${report.benchmarks.median_order_total_missing_cogs}**`)
    lines.push(`- Outlier threshold: **${report.benchmarks.outlier_threshold}**`)
    lines.push('')
    lines.push('## Per-Order Proposals')
    lines.push('')
    lines.push('| # | Order | Completed At | Order Total | Proposed COGS | Method | Confidence | Dr COGS | Cr Inventory | Note |')
    lines.push('|---|---|---|---:|---:|---|---|---|---|---|')

    report.proposals.forEach((p, idx) => {
        const dr = p.proposed_journal?.lines?.[0]?.account_code || '-'
        const cr = p.proposed_journal?.lines?.[1]?.account_code || '-'
        lines.push(`| ${idx + 1} | ${p.order_number} | ${p.completed_at || '-'} | ${p.order_total} | ${p.proposed_cogs_amount} | ${p.method} | ${p.confidence} | ${dr} | ${cr} | ${p.note} |`)
    })

    return lines.join('\n')
}

async function run() {
    try {
        await sequelize.authenticate()

        const report = await buildProposals()
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outDir = path.join(__dirname, '../../reports')
        fs.mkdirSync(outDir, { recursive: true })

        const jsonPath = path.join(outDir, `missing-cogs-settlement-proposals-${stamp}.json`)
        const csvPath = path.join(outDir, `missing-cogs-settlement-proposals-${stamp}.csv`)
        const mdPath = path.join(outDir, `missing-cogs-settlement-proposals-${stamp}.md`)

        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')
        fs.writeFileSync(csvPath, buildCsv(report), 'utf8')
        fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8')

        console.log('Generated settlement proposals successfully.')
        console.log(`JSON: ${jsonPath}`)
        console.log(`CSV:  ${csvPath}`)
        console.log(`MD:   ${mdPath}`)
        console.log(JSON.stringify(report.totals, null, 2))
    } catch (error) {
        console.error('Failed to generate settlement proposals:', error.message)
        process.exitCode = 1
    } finally {
        try {
            await sequelize.close()
        } catch (_) {
            // no-op
        }
    }
}

if (require.main === module) {
    run()
}

module.exports = { run }
