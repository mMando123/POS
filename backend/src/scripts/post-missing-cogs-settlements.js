/**
 * Post COGS settlement journal entries from generated proposal file.
 *
 * Default behavior: DRY RUN
 * Use --apply to actually post entries.
 *
 * Usage:
 *   node src/scripts/post-missing-cogs-settlements.js
 *   node src/scripts/post-missing-cogs-settlements.js --file=<path-to-json> --apply
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, Order, JournalEntry } = require('../models')
const AccountingService = require('../services/accountingService')

function parseArgs(argv) {
    const args = {
        apply: false,
        file: null
    }

    for (const arg of argv.slice(2)) {
        if (arg === '--apply') args.apply = true
        if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length)
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
            name,
            fullPath: path.join(reportsDir, name),
            mtime: fs.statSync(path.join(reportsDir, name)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime)

    if (files.length === 0) {
        throw new Error('No proposal JSON file found under backend/reports')
    }
    return files[0].fullPath
}

function pickCandidates(report) {
    return (report.proposals || []).filter(p =>
        p &&
        p.proposed_cogs_amount > 0 &&
        p.method !== 'manual_review_outlier' &&
        p.proposed_journal &&
        p.proposed_journal.lines &&
        p.proposed_journal.lines.length === 2
    )
}

async function run() {
    const args = parseArgs(process.argv)
    const proposalPath = args.file
        ? path.resolve(args.file)
        : findLatestProposalFile()

    if (!fs.existsSync(proposalPath)) {
        throw new Error(`Proposal file not found: ${proposalPath}`)
    }

    console.log(`Loading proposal file: ${proposalPath}`)
    console.log(`Mode: ${args.apply ? 'APPLY (will post entries)' : 'DRY RUN (no posting)'}`)

    const report = JSON.parse(fs.readFileSync(proposalPath, 'utf8'))
    const candidates = pickCandidates(report)

    let scanned = 0
    let posted = 0
    let skippedExisting = 0
    let failed = 0
    let totalPostedAmount = 0
    const errors = []

    await sequelize.authenticate()

    for (const proposal of candidates) {
        scanned++
        const orderId = proposal.order_id
        const amount = Math.round((parseFloat(proposal.proposed_cogs_amount || 0) + Number.EPSILON) * 100) / 100
        if (!(amount > 0)) continue

        const existing = await JournalEntry.findOne({
            where: {
                source_type: 'order_cogs',
                source_id: orderId,
                status: 'posted'
            }
        })

        if (existing) {
            skippedExisting++
            continue
        }

        if (!args.apply) {
            continue
        }

        const order = await Order.findByPk(orderId)

        const dr = proposal.proposed_journal.lines[0]
        const cr = proposal.proposed_journal.lines[1]
        const entryDate = proposal.proposed_journal.entry_date || (order?.completed_at ? String(order.completed_at).slice(0, 10) : null)

        try {
            await AccountingService.createJournalEntry({
                description: proposal.proposed_journal.description || `Historical COGS settlement for order ${proposal.order_number}`,
                sourceType: 'order_cogs',
                sourceId: orderId,
                entryDate,
                lines: [
                    {
                        accountCode: dr.account_code,
                        debit: amount,
                        credit: 0,
                        description: dr.description || `COGS settlement for ${proposal.order_number}`
                    },
                    {
                        accountCode: cr.account_code,
                        debit: 0,
                        credit: amount,
                        description: cr.description || `Inventory settlement for ${proposal.order_number}`
                    }
                ],
                branchId: proposal.branch_id || order?.branch_id || null,
                createdBy: proposal.user_id || order?.user_id || null,
                notes: JSON.stringify({
                    cogs_settlement: true,
                    settlement_method: proposal.method,
                    settlement_confidence: proposal.confidence,
                    ratio_used_percent: proposal.ratio_used,
                    generated_at: report.generated_at,
                    proposal_file: path.basename(proposalPath)
                })
            })

            posted++
            totalPostedAmount = Math.round((totalPostedAmount + amount) * 100) / 100
        } catch (err) {
            failed++
            errors.push({
                order_id: orderId,
                order_number: proposal.order_number,
                error: err.message
            })
        }
    }

    const summary = {
        proposal_file: proposalPath,
        mode: args.apply ? 'apply' : 'dry-run',
        totals: {
            proposals_in_file: report?.totals?.orders_missing_cogs || (report.proposals || []).length,
            candidates: candidates.length,
            scanned,
            posted,
            skipped_existing: skippedExisting,
            failed,
            total_posted_amount: totalPostedAmount
        },
        errors
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outDir = path.join(__dirname, '../../reports')
    fs.mkdirSync(outDir, { recursive: true })
    const summaryPath = path.join(outDir, `post-missing-cogs-settlements-summary-${stamp}.json`)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

    console.log('Settlement posting summary:')
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
            console.error('Failed to post settlement entries:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
