#!/usr/bin/env node
/**
 * Supplier Balance Update Verification Script
 * 
 * Tests that the Supplier balance is updated when a purchase receipt is recorded.
 * 
 * Usage: node src/scripts/verify-supplier-balance.js
 */

require('dotenv').config()
const { sequelize } = require('../config/database')
const { Supplier, PurchaseOrder, PurchaseReceipt, Warehouse, Branch, User, JournalEntry } = require('../models')
const AccountingHooks = require('../services/accountingHooks')

const TEST_PREFIX = 'SUP_BAL_TEST_'
let testData = {}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...')
    try {
        if (testData.receiptId) {
            // Clean up journal entries created by hook
            const je = await JournalEntry.findOne({ where: { source_type: 'purchase_receipt', source_id: testData.receiptId } })
            if (je) {
                await sequelize.query(`DELETE FROM gl_journal_lines WHERE journal_entry_id = '${je.id}'`)
                await je.destroy()
            }
            await PurchaseReceipt.destroy({ where: { id: testData.receiptId }, force: true }).catch(() => { })
        }
        if (testData.poId) {
            await PurchaseOrder.destroy({ where: { id: testData.poId }, force: true }).catch(() => { })
        }
        if (testData.supplierId) {
            await Supplier.destroy({ where: { id: testData.supplierId }, force: true }).catch(() => { })
        }
        if (testData.warehouseId) {
            await Warehouse.destroy({ where: { id: testData.warehouseId }, force: true }).catch(() => { })
        }
        console.log('✅ Cleanup complete')
    } catch (e) {
        console.log('⚠️ Cleanup partial:', e.message)
    }
}

async function run() {
    console.log('═══════════════════════════════════════════════════')
    console.log('  Supplier Balance Verification')
    console.log('  Fix S-2: Update Supplier Balance on Purchase Receipt')
    console.log('═══════════════════════════════════════════════════\n')

    await sequelize.authenticate()
    console.log('✅ Database connected\n')

    let passed = 0
    let failed = 0

    // ─── Setup Test Data ─────────────────────────────────────
    console.log('📋 Setting up test data...\n')

    // Get branch & user
    const branch = await Branch.findOne()
    const user = await User.findOne()

    // Create Warehouse
    const warehouse = await Warehouse.create({
        name_ar: `${TEST_PREFIX}مخزن`,
        name_en: `${TEST_PREFIX}Warehouse`,
        branch_id: branch.id,
        is_default: false,
        status: 'active'
    })
    testData.warehouseId = warehouse.id

    // Create Supplier
    const initialBalance = 100.00
    const supplier = await Supplier.create({
        code: `${TEST_PREFIX}SUP`,
        name_ar: `${TEST_PREFIX}المورد`,
        name_en: `${TEST_PREFIX}Supplier`,
        current_balance: initialBalance
    })
    testData.supplierId = supplier.id
    console.log(`  Supplier created: ${supplier.name_en}, Initial Balance: ${initialBalance}`)

    // Create Purchase Receipt
    const cost = 500.00
    const receipt = await PurchaseReceipt.create({
        receipt_number: `${TEST_PREFIX}REC-001`,
        supplier_name: supplier.name_en,
        supplier_id: supplier.id,
        warehouse_id: warehouse.id,
        total_cost: cost,
        status: 'received',
        created_by: user.id
    })
    testData.receiptId = receipt.id
    console.log(`  Receipt created: ${receipt.receipt_number}, Cost: ${cost}`)

    // ─── TEST: Call Hook ─────────────────────────────────────
    console.log('\n─── Test: Calling onPurchaseReceived hook ───')

    await AccountingHooks.onPurchaseReceived(receipt)

    // Wait for async update
    await new Promise(r => setTimeout(r, 1000))

    // Check Supplier Balance
    const updatedSupplier = await Supplier.findByPk(supplier.id)
    const expectedBalance = initialBalance + cost
    const actualBalance = parseFloat(updatedSupplier.current_balance)

    console.log(`  Expected Balance: ${expectedBalance}`)
    console.log(`  Actual Balance:   ${actualBalance}`)

    if (Math.abs(actualBalance - expectedBalance) < 0.01) {
        console.log('  ✅ PASS: Supplier balance updated correctly')
        passed++
    } else {
        console.log('  ❌ FAIL: Supplier balance incorrect')
        failed++
    }

    // ─── Summary ─────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════')
    console.log(`  Results: ${passed} PASSED, ${failed} FAILED`)

    if (failed === 0) {
        console.log('\n  🎉 ALL TESTS PASSED!')
    } else {
        console.log('\n  ⚠️ Some tests failed.')
    }
    console.log('═══════════════════════════════════════════════════\n')

    // Cleanup
    await cleanup()
    await sequelize.close()
    process.exit(failed > 0 ? 1 : 0)
}

run().catch(async (err) => {
    console.error('💥 Script failed:', err.message)
    await cleanup().catch(() => { })
    await sequelize.close().catch(() => { })
    process.exit(1)
})
