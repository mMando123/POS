/**
 * Reconcile Inventory GL balance (account 1100) against stock valuation.
 *
 * Default behavior: DRY RUN (proposal only).
 * Use --apply to post the adjusting journal entry.
 *
 * Usage:
 *   node src/scripts/reconcile-inventory-gl.js
 *   node src/scripts/reconcile-inventory-gl.js --counter-account=3002 --apply
 *   node src/scripts/reconcile-inventory-gl.js --entry-date=2026-02-22 --materiality=0.01
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')
const { QueryTypes } = require('sequelize')
const AccountingService = require('../services/accountingService')

function round2(value) {
    return Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100
}

function parseArgs(argv) {
    const args = {
        apply: false,
        entryDate: null,
        counterAccount: '3002',
        inventoryAccount: '1100',
        materiality: 0.01
    }

    for (const arg of argv.slice(2)) {
        if (arg === '--apply') args.apply = true
        if (arg.startsWith('--entry-date=')) args.entryDate = arg.slice('--entry-date='.length)
        if (arg.startsWith('--counter-account=')) args.counterAccount = arg.slice('--counter-account='.length)
        if (arg.startsWith('--inventory-account=')) args.inventoryAccount = arg.slice('--inventory-account='.length)
        if (arg.startsWith('--materiality=')) {
            args.materiality = parseFloat(arg.slice('--materiality='.length))
        }
    }

    return args
}

async function loadSnapshot(inventoryAccountCode) {
    const [row] = await sequelize.query(
        `
        SELECT
            COALESCE((
                SELECT SUM(COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0))
                FROM gl_journal_lines jl
                JOIN gl_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
                JOIN gl_accounts a ON a.id = jl.account_id
                WHERE a.code = :inventoryAccount
            ), 0) AS inventory_gl_balance,
            COALESCE((SELECT SUM(quantity * avg_cost) FROM stock), 0) AS stock_valuation
        `,
        {
            replacements: { inventoryAccount: inventoryAccountCode },
            type: QueryTypes.SELECT
        }
    )

    const inventoryGL = round2(row.inventory_gl_balance)
    const stockValuation = round2(row.stock_valuation)
    const gap = round2(inventoryGL - stockValuation)

    return { inventoryGL, stockValuation, gap }
}

function buildAdjustment({ gap, inventoryAccount, counterAccount }) {
    const amount = round2(Math.abs(gap))
    if (!(amount > 0)) return null

    // gap < 0 means GL inventory is lower than stock valuation.
    // We need to increase inventory (DR inventory, CR counter-account).
    if (gap < 0) {
        return {
            amount,
            lines: [
                {
                    accountCode: inventoryAccount,
                    debit: amount,
                    credit: 0,
                    description: 'Inventory reconciliation adjustment (increase inventory to match stock valuation)'
                },
                {
                    accountCode: counterAccount,
                    debit: 0,
                    credit: amount,
                    description: 'Counterpart for inventory reconciliation adjustment'
                }
            ],
            direction: 'inventory_understated_in_gl'
        }
    }

    // gap > 0 means GL inventory is higher than stock valuation.
    // We need to decrease inventory (DR counter-account, CR inventory).
    return {
        amount,
        lines: [
            {
                accountCode: counterAccount,
                debit: amount,
                credit: 0,
                description: 'Counterpart for inventory reconciliation adjustment'
            },
            {
                accountCode: inventoryAccount,
                debit: 0,
                credit: amount,
                description: 'Inventory reconciliation adjustment (decrease inventory to match stock valuation)'
            }
        ],
        direction: 'inventory_overstated_in_gl'
    }
}

async function run() {
    const args = parseArgs(process.argv)
    await sequelize.authenticate()

    const snapshot = await loadSnapshot(args.inventoryAccount)
    const adjustment = buildAdjustment({
        gap: snapshot.gap,
        inventoryAccount: args.inventoryAccount,
        counterAccount: args.counterAccount
    })

    const proposal = {
        generated_at: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'dry-run',
        entry_date: args.entryDate || new Date().toISOString().slice(0, 10),
        accounts: {
            inventory: args.inventoryAccount,
            counterpart: args.counterAccount
        },
        materiality: args.materiality,
        snapshot,
        requires_adjustment: !!adjustment && Math.abs(snapshot.gap) > args.materiality,
        adjustment: adjustment
            ? {
                direction: adjustment.direction,
                amount: adjustment.amount,
                lines: adjustment.lines
            }
            : null,
        posted: false,
        entry_number: null,
        notes: 'Historical inventory reconciliation between stock valuation and GL inventory account.'
    }

    const outDir = path.join(__dirname, '../../reports')
    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const proposalPath = path.join(outDir, `inventory-gl-reconciliation-${stamp}.json`)

    if (!proposal.requires_adjustment) {
        fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), 'utf8')
        console.log('No material inventory reconciliation adjustment is required.')
        console.log(JSON.stringify(proposal, null, 2))
        console.log(`Proposal file: ${proposalPath}`)
        return
    }

    if (args.apply) {
        const posted = await AccountingService.createJournalEntry({
            description: 'Inventory GL reconciliation adjustment',
            sourceType: 'inventory_reconciliation',
            sourceId: `inventory-gap-${stamp}`,
            entryDate: proposal.entry_date,
            lines: adjustment.lines,
            notes: JSON.stringify({
                inventory_gl_balance: snapshot.inventoryGL,
                stock_valuation: snapshot.stockValuation,
                gap: snapshot.gap,
                direction: adjustment.direction,
                materiality: args.materiality
            })
        })

        proposal.posted = true
        proposal.entry_number = posted.entry_number
        proposal.entry_id = posted.id
    }

    fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), 'utf8')

    console.log('Inventory reconciliation result:')
    console.log(JSON.stringify(proposal, null, 2))
    console.log(`Proposal file: ${proposalPath}`)
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Inventory reconciliation failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
