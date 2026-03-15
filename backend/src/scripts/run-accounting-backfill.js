const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')
const AccountingHooks = require('../services/accountingHooks')
const AccountingService = require('../services/accountingService')

async function runBackfill() {
    try {
        console.log('Starting full accounting backfill...')

        // Ensure DB connectivity
        await sequelize.authenticate()
        console.log('Database connected.')

        const orderIntegrityStrategy = process.env.BACKFILL_PENDING_COMPLETED_STRATEGY || 'reopen_order'

        // 0) Fix historical inconsistent orders (completed + pending)
        const integrityResult = await AccountingHooks.reconcileCompletedPendingOrders({
            limit: 5000,
            dryRun: false,
            strategy: orderIntegrityStrategy
        })

        // 1) Orders (Revenue + COGS with historical estimation enabled)
        const orderResult = await AccountingHooks.backfillOrders({
            limit: 5000,
            estimateMissingCOGS: true
        })

        // 2) Purchase receipts (Inventory + AP)
        const receiptResult = await AccountingHooks.backfillPurchaseReceipts({ limit: 5000 })

        // 3) Reconcile supplier balances from GL
        const reconcile = await AccountingService.reconcileAllSuppliers({ autoFix: true })

        console.log('\nBackfill summary:')
        console.log('\n0) Order Integrity')
        console.log(`   - Strategy Used:          ${integrityResult.strategy}`)
        console.log(`   - Total Inconsistent:     ${integrityResult.total}`)
        console.log(`   - Fixed:                  ${integrityResult.fixed}`)
        console.log(`   - Reopened Orders:        ${integrityResult.reopened}`)
        console.log(`   - Marked Paid:            ${integrityResult.markedPaid}`)
        console.log(`   - Failed:                 ${integrityResult.failed}`)

        console.log('\n1) Orders')
        console.log(`   - Revenue Entries Created: ${orderResult.processed}`)
        console.log(`   - COGS Entries Created:    ${orderResult.cogsProcessed}`)
        console.log(`   - COGS Estimated:          ${orderResult.cogsEstimated}`)
        console.log(`   - Skipped (Already Exist): ${orderResult.skipped}`)
        console.log(`   - Total Orders Checked:    ${orderResult.total}`)

        console.log('\n2) Purchase Receipts')
        console.log(`   - Receipt Entries Created: ${receiptResult.processed}`)
        console.log(`   - Skipped (Already Exist): ${receiptResult.skipped}`)
        console.log(`   - Suppliers Synced:        ${receiptResult.syncedSuppliers}`)
        console.log(`   - Total Receipts Checked:  ${receiptResult.total}`)

        console.log('\n3) Supplier Reconciliation')
        console.log(`   - Total Suppliers:         ${reconcile.total}`)
        console.log(`   - Matched:                 ${reconcile.matched}`)
        console.log(`   - Discrepancies Found:     ${reconcile.discrepancies}`)
        console.log(`   - Corrected:               ${reconcile.corrected}`)

        process.exit(0)
    } catch (error) {
        console.error('Backfill failed:', error)
        process.exit(1)
    }
}

runBackfill()
