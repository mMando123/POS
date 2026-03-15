/**
 * Post manual COGS entries for unresolved outlier orders.
 *
 * Default behavior: DRY RUN
 * Use --apply to post entries.
 *
 * Usage:
 *   node src/scripts/post-manual-cogs-outliers.js
 *   node src/scripts/post-manual-cogs-outliers.js --set=20260131-0022:10.50,20260131-0028:12.00
 *   node src/scripts/post-manual-cogs-outliers.js --set=20260131-0022:10.50 --apply
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, Order, JournalEntry } = require('../models')
const AccountingService = require('../services/accountingService')
const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')

function round2(value) {
    return Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100
}

function parseArgs(argv) {
    const args = {
        apply: false,
        proposalFile: null,
        setArg: null,
        entryDate: null
    }

    for (const arg of argv.slice(2)) {
        if (arg === '--apply') args.apply = true
        if (arg.startsWith('--file=')) args.proposalFile = arg.slice('--file='.length)
        if (arg.startsWith('--set=')) args.setArg = arg.slice('--set='.length)
        if (arg.startsWith('--entry-date=')) args.entryDate = arg.slice('--entry-date='.length)
    }
    return args
}

function findLatestProposalFile() {
    const reportsDir = path.join(__dirname, '../../reports')
    if (!fs.existsSync(reportsDir)) {
        throw new Error(`Reports directory not found: ${reportsDir}`)
    }

    const files = fs.readdirSync(reportsDir)
        .filter(name => name.startsWith('missing-cogs-settlement-proposals-') && name.endsWith('.json'))
        .map(name => ({
            fullPath: path.join(reportsDir, name),
            mtime: fs.statSync(path.join(reportsDir, name)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime)

    if (files.length === 0) {
        throw new Error('No COGS proposal file found under backend/reports')
    }
    return files[0].fullPath
}

function parseManualSet(setArg) {
    if (!setArg) return {}

    const map = {}
    const parts = setArg.split(',').map(p => p.trim()).filter(Boolean)
    for (const part of parts) {
        const [key, amountStr] = part.split(':')
        const amount = round2(amountStr)
        if (!key || !(amount > 0)) {
            throw new Error(`Invalid --set item "${part}". Expected format: order_number:amount`)
        }
        map[key] = amount
    }
    return map
}

function pickOutliers(report) {
    return (report.proposals || []).filter(p =>
        p &&
        p.method === 'manual_review_outlier' &&
        p.proposed_cogs_amount === 0
    )
}

function formatOutlierList(outliers) {
    if (!outliers.length) return 'No unresolved outlier proposals found.'
    return outliers
        .map((p, idx) => `${idx + 1}. ${p.order_number} | total=${p.order_total} | note=${p.note}`)
        .join('\n')
}

async function run() {
    const args = parseArgs(process.argv)
    const proposalPath = args.proposalFile
        ? path.resolve(args.proposalFile)
        : findLatestProposalFile()

    if (!fs.existsSync(proposalPath)) {
        throw new Error(`Proposal file not found: ${proposalPath}`)
    }

    const report = JSON.parse(fs.readFileSync(proposalPath, 'utf8'))
    const outliers = pickOutliers(report)
    const manualSet = parseManualSet(args.setArg)

    console.log(`Loading proposal file: ${proposalPath}`)
    console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY RUN'}`)
    console.log(`Unresolved outliers found: ${outliers.length}`)
    console.log(formatOutlierList(outliers))

    if (outliers.length === 0) return

    if (!args.setArg) {
        console.log('\nNo --set provided. Nothing to post.')
        console.log('Example:')
        console.log('  node src/scripts/post-manual-cogs-outliers.js --set=20260131-0022:10.50,20260131-0028:12.00 --apply')
        return
    }

    await sequelize.authenticate()

    const outlierByOrderNumber = {}
    const outlierByOrderId = {}
    for (const p of outliers) {
        outlierByOrderNumber[p.order_number] = p
        outlierByOrderId[p.order_id] = p
    }

    let scanned = 0
    let posted = 0
    let skippedExisting = 0
    let failed = 0
    let totalPostedAmount = 0
    const errors = []

    for (const [key, amount] of Object.entries(manualSet)) {
        scanned++
        const proposal = outlierByOrderNumber[key] || outlierByOrderId[key]
        if (!proposal) {
            failed++
            errors.push({ key, error: 'Order not found in unresolved outlier proposal set' })
            continue
        }

        const existing = await JournalEntry.findOne({
            where: {
                source_type: 'order_cogs',
                source_id: proposal.order_id,
                status: 'posted'
            }
        })
        if (existing) {
            skippedExisting++
            continue
        }

        if (!args.apply) continue

        const order = await Order.findByPk(proposal.order_id)
        if (!order) {
            failed++
            errors.push({ key, error: `Order not found by id ${proposal.order_id}` })
            continue
        }

        let cogsAccount = '5001'
        let inventoryAccount = '1100'
        try {
            const resolved = await AccountResolver.resolveMany({
                cogs: ACCOUNT_KEYS.COGS,
                inventory: ACCOUNT_KEYS.INVENTORY
            }, { branchId: proposal.branch_id || order.branch_id || null })
            cogsAccount = resolved.cogs || cogsAccount
            inventoryAccount = resolved.inventory || inventoryAccount
        } catch (_) {
            // Keep fallback account codes.
        }

        try {
            await AccountingService.createJournalEntry({
                description: `Manual COGS settlement for outlier order ${proposal.order_number}`,
                sourceType: 'order_cogs',
                sourceId: proposal.order_id,
                entryDate: args.entryDate || (order.completed_at ? String(order.completed_at).slice(0, 10) : null),
                lines: [
                    {
                        accountCode: cogsAccount,
                        debit: amount,
                        credit: 0,
                        description: `Manual COGS settlement (outlier): ${proposal.order_number}`
                    },
                    {
                        accountCode: inventoryAccount,
                        debit: 0,
                        credit: amount,
                        description: `Inventory reduction (manual outlier settlement): ${proposal.order_number}`
                    }
                ],
                branchId: proposal.branch_id || order.branch_id || null,
                createdBy: proposal.user_id || order.user_id || null,
                notes: JSON.stringify({
                    manual_cogs_outlier_settlement: true,
                    source_proposal_file: path.basename(proposalPath),
                    original_note: proposal.note
                })
            })
            posted++
            totalPostedAmount = round2(totalPostedAmount + amount)
        } catch (err) {
            failed++
            errors.push({ key, order_number: proposal.order_number, error: err.message })
        }
    }

    const summary = {
        proposal_file: proposalPath,
        mode: args.apply ? 'apply' : 'dry-run',
        totals: {
            unresolved_outliers: outliers.length,
            manual_set_items: Object.keys(manualSet).length,
            scanned,
            posted,
            skipped_existing: skippedExisting,
            failed,
            total_posted_amount: totalPostedAmount
        },
        errors
    }

    const outDir = path.join(__dirname, '../../reports')
    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const summaryPath = path.join(outDir, `post-manual-cogs-outliers-summary-${stamp}.json`)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

    console.log('\nManual outlier settlement summary:')
    console.log(JSON.stringify(summary, null, 2))
    console.log(`Summary file: ${summaryPath}`)
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Manual outlier settlement failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
