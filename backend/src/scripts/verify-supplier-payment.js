#!/usr/bin/env node
/**
 * Supplier Payment Verification Script
 * 
 * Tests that recording a supplier payment:
 * 1. Creates a GL Journal Entry (DR AP / CR Bank).
 * 2. Updates Supplier Balance (Decrease Liability).
 * 3. Updates Purchase Order Status (Paid/Partial).
 * 
 * Usage: node src/scripts/verify-supplier-payment.js
 */

require('dotenv').config()
const { sequelize } = require('../config/database')
const { Supplier, PurchaseOrder, SupplierPayment, JournalEntry, JournalLine, Account, User, Branch, Warehouse } = require('../models')
const AccountingHooks = require('../services/accountingHooks')

const TEST_PREFIX = 'PAY_TEST_'
let testData = {}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...')
    try {
        if (testData.paymentId) {
            // Clean up JE
            const je = await JournalEntry.findOne({ where: { source_type: 'supplier_payment', source_id: testData.paymentId } })
            if (je) {
                await sequelize.query(`DELETE FROM gl_journal_lines WHERE journal_entry_id = '${je.id}'`)
                await je.destroy()
            }
            await SupplierPayment.destroy({ where: { id: testData.paymentId }, force: true }).catch(() => { })
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
    console.log('  Supplier Payment Verification')
    console.log('  Fix S-4: Supplier Payments Module')
    console.log('═══════════════════════════════════════════════════\n')

    await sequelize.authenticate()
    console.log('✅ Database connected\n')

    let passed = 0
    let failed = 0

    // ─── Setup Test Data ─────────────────────────────────────
    console.log('📋 Setting up test data...\n')

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

    // Create Supplier with initial debt
    const initialBalance = 1000.00
    const supplier = await Supplier.create({
        code: `${TEST_PREFIX}SUP`,
        name_ar: `${TEST_PREFIX}المورد`,
        name_en: `${TEST_PREFIX}Supplier`,
        current_balance: initialBalance
    })
    testData.supplierId = supplier.id
    console.log(`  Supplier created: Balance ${initialBalance}`)

    // Create PO with unpaid amount
    const poTotal = 1000.00
    const po = await PurchaseOrder.create({
        po_number: `${TEST_PREFIX}PO-001`,
        supplier_id: supplier.id,
        warehouse_id: warehouse.id,
        total_amount: poTotal,
        paid_amount: 0,
        payment_status: 'unpaid',
        created_by: user.id,
        order_date: new Date()
    })
    testData.poId = po.id
    console.log(`  PO created: Total ${poTotal}, Paid 0`)

    // ─── TEST: Process Payment ───────────────────────────────
    console.log('\n─── Test: processing payment via hook ───')

    const paymentAmount = 500.00
    const payment = await SupplierPayment.create({
        payment_number: `${TEST_PREFIX}PAY-001`,
        supplier_id: supplier.id,
        purchase_order_id: po.id,
        amount: paymentAmount,
        payment_method: 'bank_transfer',
        payment_date: new Date(),
        created_by: user.id,
        status: 'completed'
    })
    testData.paymentId = payment.id

    // Call Hook Manually (mimicking route controller)
    await AccountingHooks.onSupplierPayment(payment)

    // Wait for async operations
    await new Promise(r => setTimeout(r, 1000))

    // ─── Verify Results ──────────────────────────────────────

    // 1. Check Supplier Balance
    const updatedSupplier = await Supplier.findByPk(supplier.id)
    const expectedBalance = initialBalance - paymentAmount
    const actualBalance = parseFloat(updatedSupplier.current_balance)

    console.log(`  Supplier Balance: Expected ${expectedBalance}, Actual ${actualBalance}`)
    if (Math.abs(actualBalance - expectedBalance) < 0.01) {
        console.log('  ✅ PASS: Supplier balance updated')
        passed++
    } else {
        console.log('  ❌ FAIL: Supplier balance incorrect')
        failed++
    }

    // 2. Check PO Status
    const updatedPO = await PurchaseOrder.findByPk(po.id)
    const expectedPaid = paymentAmount
    const actualPaid = parseFloat(updatedPO.paid_amount)

    console.log(`  PO Paid Amount: Expected ${expectedPaid}, Actual ${actualPaid}`)
    console.log(`  PO Status: Expected 'partial', Actual '${updatedPO.payment_status}'`)

    if (Math.abs(actualPaid - expectedPaid) < 0.01 && updatedPO.payment_status === 'partial') {
        console.log('  ✅ PASS: PO updated correctly')
        passed++
    } else {
        console.log('  ❌ FAIL: PO update incorrect')
        failed++
    }

    // 3. Check Journal Entry
    const je = await JournalEntry.findOne({
        where: { source_type: 'supplier_payment', source_id: payment.id },
        include: [{ model: JournalLine, as: 'lines', include: [{ model: Account, as: 'account' }] }]
    })

    if (je) {
        console.log(`  ✅ JE Created: ${je.entry_number}`)

        // Check for AP Debit (Dr 2002)
        const apDebit = je.lines.find(l => l.account.code === '2002' && parseFloat(l.debit_amount) > 0)
        // Check for Bank Credit (Cr 1002) - since method is bank_transfer
        const bankCredit = je.lines.find(l => l.account.code === '1002' && parseFloat(l.credit_amount) > 0)

        if (apDebit && bankCredit) {
            console.log(`     DR AP (2002): ${apDebit.debit_amount}`)
            console.log(`     CR Bank (1002): ${bankCredit.credit_amount}`)
            passed++
        } else {
            console.log('  ❌ FAIL: JE lines incorrect (Expected DR 2002 / CR 1002)')
            failed++
        }
    } else {
        console.log('  ❌ FAIL: JE NOT created')
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
