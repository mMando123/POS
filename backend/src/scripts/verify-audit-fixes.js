const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { sequelize, Shift, Order, Refund, User, Account, Branch } = require('../models')
const ShiftService = require('../services/shiftService')

async function run() {
    try {
        sequelize.options.logging = false
        await sequelize.authenticate()
        console.log('DB Connected')

        // Ensure Branch Exists
        let branch = await Branch.findOne()
        if (!branch) {
            console.log('Creating Test Branch')
            branch = await Branch.create({
                name_ar: 'Test Branch',
                name_en: 'Test Branch'
            })
        }
        console.log(`Using Branch: ${branch.id}`)

        // 1. Verify Refund logic for Expected Cash
        console.log('\n--- Testing Shift Expected Cash Logic ---')

        // Find or create user
        let user = await User.findOne()
        if (!user) {
            console.log('Creating dummy user for test...')
            // create minimal user
            user = await User.create({
                username: 'audit_test_user',
                password: 'password',
                role: 'admin',
                branch_id: branch.id
            })
        } else {
            if (user.branch_id !== branch.id) {
                await user.update({ branch_id: branch.id }).catch(e => console.log('User branch update skipped'))
            }
        }

        // Clean up any open shifts for this user to avoid conflicts
        await Shift.update({ status: 'closed', end_time: new Date() }, { where: { user_id: user.id, status: 'open' } })

        // Create open shift
        const shift = await Shift.create({
            user_id: user.id,
            branch_id: user.branch_id,
            starting_cash: 1000,
            status: 'open',
            cash_sales: 0,
            card_sales: 0,
            start_time: new Date()
        })
        console.log(`Created Shift ${shift.id}, Starting Cash: 1000`)

        // Create Cash Order
        const order = await Order.create({
            shift_id: shift.id,
            total: 200,
            subtotal: 200,
            tax: 0,
            discount: 0,
            payment_method: 'cash',
            status: 'completed',
            payment_status: 'paid',
            user_id: user.id,
            branch_id: user.branch_id,
            order_number: `ORD-${Date.now()}`,
            order_type: 'walkin'
        })
        console.log(`Created Cash Order: 200`)

        // Create Cash Refund (Completed)
        // Note: Refund needs order_id, refund_amount, status='completed'
        // And refund_shift_id = shift.id
        const refund = await Refund.create({
            refund_number: `REF-${Date.now()}`,
            order_id: order.id,
            refund_amount: 50,
            refund_shift_id: shift.id,
            original_shift_id: shift.id,
            status: 'completed',
            processed_by: user.id,
            refund_type: 'FULL_REFUND',
            refund_reason: 'test',
            refund_category: 'other',
            branch_id: user.branch_id,
            original_order_total: 200
        })
        console.log(`Created Cash Refund: 50`)

        // Update order to refunded to verify it is still counted in Gross Sales
        await order.update({ payment_status: 'refunded' })


        // Close Shift
        // Expected: 1000 (Start) + 200 (Sales) - 50 (Refund) = 1150
        // We pass actual ending cash = 1150
        // endShift(userId, endingCash, notes)
        const result = await ShiftService.endShift(user.id, 1150, 'Test closing')

        if (result.success) {
            console.log(`Shift Closed. Expected Cash: ${result.summary.expected}`)
            if (Math.abs(result.summary.expected - 1150) < 0.01) {
                console.log('✅ PASS: Expected Cash calculation correct (1150)')
            } else {
                console.error(`❌ FAIL: Expected Cash calculation wrong. Got ${result.summary.expected}, Wanted 1150`)
            }
        } else {
            console.error('❌ FAIL: Shift closing failed', result)
        }

        // 2. Verify GL Accounts Existence
        console.log('\n--- Verifying GL Accounts ---')
        const ap = await Account.findOne({ where: { code: '2002' } })
        const shrink = await Account.findOne({ where: { code: '5004' } })

        if (ap) console.log('✅ PASS: AP Account (2002) exists')
        else console.error('❌ FAIL: AP Account (2002) missing')

        if (shrink) console.log('✅ PASS: Shrinkage Account (5004) exists')
        else console.error('❌ FAIL: Shrinkage Account (5004) missing')

    } catch (error) {
        console.error('Test Failed Message:', error.message)
        if (error.errors) console.error(error.errors.map(e => e.message))
    } finally {
        process.exit(0)
    }
}

run()
