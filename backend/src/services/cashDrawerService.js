/**
 * CashDrawerService — Accounting-Aware Cash Reconciliation
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Overlays the existing Shift system with proper accounting.
 * Does NOT modify the Shift table or ShiftService — reads from them.
 * 
 * Flow:
 * 1. openDrawer()  → Creates CashDrawer record + opening journal entry
 * 2. Order events   → tracked via journal entries (not this service)
 * 3. closeDrawer()  → Computes expected balance, records variance, closes
 */

const { CashDrawer, Shift, Order, Refund, JournalEntry, OrderPayment, sequelize } = require('../models')
const AccountingService = require('./accountingService')
const { AccountResolver, ACCOUNT_KEYS } = require('./accountResolver')
const OrderPaymentService = require('./orderPaymentService')
const { Op } = require('sequelize')
const logger = require('./logger')

class CashDrawerService {

    /**
     * Open a cash drawer (called when shift opens)
     */
    static async openDrawer({ shiftId, userId, branchId, openingBalance = 0, transaction: extTxn = null }) {
        const transaction = extTxn || await sequelize.transaction()
        const isOwnTxn = !extTxn

        try {
            // Check if drawer already exists for this shift
            const existing = await CashDrawer.findOne({
                where: { shift_id: shiftId },
                transaction
            })

            if (existing) {
                if (isOwnTxn) await transaction.rollback()
                return existing
            }

            // Create opening journal entry (if there's an opening balance)
            let openingJournalId = null
            if (parseFloat(openingBalance) > 0) {
                const je = await AccountingService.recordDrawerOpening(
                    shiftId, parseFloat(openingBalance),
                    { branchId, userId, transaction }
                )
                if (je) openingJournalId = je.id
            }

            const drawer = await CashDrawer.create({
                shift_id: shiftId,
                branch_id: branchId,
                user_id: userId,
                opening_balance: openingBalance,
                opening_journal_id: openingJournalId,
                opened_at: new Date(),
                status: 'open'
            }, { transaction })

            if (isOwnTxn) await transaction.commit()
            logger.info(`💰 Cash drawer opened for shift ${shiftId}`)
            return drawer

        } catch (error) {
            if (isOwnTxn) await transaction.rollback()
            throw error
        }
    }

    /**
     * Close a cash drawer (called when shift closes)
     * 
     * Computes expected balance from actual transactions,
     * records variance as a journal entry.
     */
    static async closeDrawer({ shiftId, actualBalance, userId, notes = '', transaction: extTxn = null }) {
        const transaction = extTxn || await sequelize.transaction()
        const isOwnTxn = !extTxn

        try {
            const drawer = await CashDrawer.findOne({
                where: { shift_id: shiftId, status: 'open' },
                lock: transaction.LOCK.UPDATE,
                transaction
            })

            if (!drawer) {
                throw new Error('DRAWER_NOT_FOUND: No open cash drawer for this shift')
            }

            // Compute totals from actual orders during this shift
            const orders = await Order.findAll({
                where: {
                    shift_id: shiftId,
                    payment_status: 'paid',
                    status: { [Op.ne]: 'cancelled' }
                },
                transaction
            })

            const paymentTotals = await OrderPaymentService.getShiftTotals(shiftId, { transaction })
            const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
            const cardSales = Math.round(parseFloat(paymentTotals.card || 0) * 100) / 100
            const onlineSales = Math.round(parseFloat(paymentTotals.online || 0) * 100) / 100

            const round2 = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100

            // Get refunds during this shift (support legacy approved + current completed)
            const refunds = await Refund.findAll({
                where: {
                    refund_shift_id: shiftId,
                    status: { [Op.in]: ['approved', 'completed'] }
                },
                include: [{ model: Order, attributes: ['id', 'payment_method', 'total'], required: false }],
                transaction
            })

            const refundOrderIds = [...new Set(refunds
                .map(r => r.order_id)
                .filter(Boolean))]

            const paymentRows = refundOrderIds.length > 0
                ? await OrderPayment.findAll({
                    where: { order_id: { [Op.in]: refundOrderIds } },
                    attributes: [
                        'order_id',
                        'payment_method',
                        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
                    ],
                    group: ['order_id', 'payment_method'],
                    transaction
                })
                : []

            const orderTotalPaidMap = new Map()
            const orderCashPaidMap = new Map()
            for (const row of paymentRows) {
                const orderId = row.order_id
                const amount = round2(row.get('amount'))
                const prevTotal = orderTotalPaidMap.get(orderId) || 0
                orderTotalPaidMap.set(orderId, round2(prevTotal + amount))
                if (row.payment_method === 'cash') {
                    const prevCash = orderCashPaidMap.get(orderId) || 0
                    orderCashPaidMap.set(orderId, round2(prevCash + amount))
                }
            }

            const cashRefunds = refunds.reduce((sum, refund) => {
                const refundAmount = round2(refund.refund_amount || 0)
                if (refundAmount <= 0) return sum

                const order = refund.Order
                const orderId = refund.order_id
                let cashPortion = 0

                if (order?.payment_method === 'cash') {
                    cashPortion = refundAmount
                } else if (order?.payment_method === 'multi') {
                    const totalPaid = orderTotalPaidMap.get(orderId) || round2(order?.total || 0)
                    const cashPaid = orderCashPaidMap.get(orderId) || 0
                    const cashRatio = totalPaid > 0 ? Math.max(0, Math.min(1, cashPaid / totalPaid)) : 0
                    cashPortion = round2(refundAmount * cashRatio)
                }

                return round2(sum + cashPortion)
            }, 0)

            // Expected balance = opening + cash_sales - cash_refunds + cash_in - cash_out
            const openingBal = parseFloat(drawer.opening_balance)
            const cashIn = parseFloat(drawer.cash_in_total || 0)
            const cashOut = parseFloat(drawer.cash_out_total || 0)

            const expectedBalance = Math.round(
                (openingBal + cashSales - cashRefunds + cashIn - cashOut) * 100
            ) / 100

            const actualBal = Math.round(parseFloat(actualBalance) * 100) / 100
            const variance = Math.round((actualBal - expectedBalance) * 100) / 100

            // Record variance journal entry
            let varianceJournalId = null
            if (variance !== 0) {
                const varianceJE = await AccountingService.recordCashVariance(
                    shiftId, variance,
                    { branchId: drawer.branch_id, userId, transaction }
                )
                if (varianceJE) varianceJournalId = varianceJE.id
            }

            // Update drawer
            await drawer.update({
                cash_sales_total: cashSales,
                card_sales_total: cardSales,
                online_sales_total: onlineSales,
                cash_refunds_total: cashRefunds,
                expected_balance: expectedBalance,
                actual_balance: actualBal,
                variance,
                order_count: orders.length,
                refund_count: refunds.length,
                variance_journal_id: varianceJournalId,
                status: 'closed',
                closed_at: new Date(),
                notes
            }, { transaction })

            if (isOwnTxn) await transaction.commit()

            logger.info(`💰 Cash drawer closed for shift ${shiftId} | Expected: ${expectedBalance}, Actual: ${actualBal}, Variance: ${variance}`)

            return {
                drawer,
                summary: {
                    opening: openingBal,
                    cashSales,
                    cardSales,
                    onlineSales,
                    cashRefunds,
                    cashIn,
                    cashOut,
                    expected: expectedBalance,
                    actual: actualBal,
                    variance,
                    orderCount: orders.length,
                    refundCount: refunds.length
                }
            }

        } catch (error) {
            if (isOwnTxn) await transaction.rollback()
            throw error
        }
    }

    /**
     * Record manual cash in (e.g., adding change float)
     */
    static async recordCashIn({ shiftId, amount, reason, userId, transaction: extTxn = null }) {
        const transaction = extTxn || await sequelize.transaction()
        const isOwnTxn = !extTxn

        try {
            const drawer = await CashDrawer.findOne({
                where: { shift_id: shiftId, status: 'open' },
                transaction
            })

            if (!drawer) throw new Error('No open drawer for this shift')

            const amt = Math.round(parseFloat(amount) * 100) / 100
            if (amt <= 0) throw new Error('Amount must be positive')

            // Phase 3: Dynamic account resolution
            const accts = await AccountResolver.resolveMany({
                cash: ACCOUNT_KEYS.CASH,
                capital: ACCOUNT_KEYS.OWNER_CAPITAL,
            }, { branchId: drawer.branch_id })

            // Journal entry: DR Cash, CR Owner Capital
            await AccountingService.createJournalEntry({
                description: `إضافة نقدية: ${reason}`,
                sourceType: 'shift',
                sourceId: String(shiftId),
                lines: [
                    { accountCode: accts.cash, debit: amt, credit: 0, description: 'Cash added to drawer' },
                    { accountCode: accts.capital, debit: 0, credit: amt, description: reason }
                ],
                branchId: drawer.branch_id,
                createdBy: userId,
                transaction
            })

            await drawer.increment('cash_in_total', { by: amt, transaction })

            if (isOwnTxn) await transaction.commit()
            return drawer

        } catch (error) {
            if (isOwnTxn) await transaction.rollback()
            throw error
        }
    }

    /**
     * Record manual cash out (e.g., petty cash withdrawal)
     */
    static async recordCashOut({ shiftId, amount, reason, userId, transaction: extTxn = null }) {
        const transaction = extTxn || await sequelize.transaction()
        const isOwnTxn = !extTxn

        try {
            const drawer = await CashDrawer.findOne({
                where: { shift_id: shiftId, status: 'open' },
                transaction
            })

            if (!drawer) throw new Error('No open drawer for this shift')

            const amt = Math.round(parseFloat(amount) * 100) / 100
            if (amt <= 0) throw new Error('Amount must be positive')

            // Phase 3: Dynamic account resolution
            const accts = await AccountResolver.resolveMany({
                expense: ACCOUNT_KEYS.GENERAL_EXPENSE,
                cash: ACCOUNT_KEYS.CASH,
            }, { branchId: drawer.branch_id })

            // Journal entry: DR Expense, CR Cash
            await AccountingService.createJournalEntry({
                description: `سحب نقدي: ${reason}`,
                sourceType: 'shift',
                sourceId: String(shiftId),
                lines: [
                    { accountCode: accts.expense, debit: amt, credit: 0, description: reason },
                    { accountCode: accts.cash, debit: 0, credit: amt, description: 'Cash withdrawn' }
                ],
                branchId: drawer.branch_id,
                createdBy: userId,
                transaction
            })

            await drawer.increment('cash_out_total', { by: amt, transaction })

            if (isOwnTxn) await transaction.commit()
            return drawer

        } catch (error) {
            if (isOwnTxn) await transaction.rollback()
            throw error
        }
    }

    /**
     * Get drawer status and summary
     */
    static async getDrawerStatus(shiftId) {
        const drawer = await CashDrawer.findOne({
            where: { shift_id: shiftId },
            include: [
                { model: JournalEntry, as: 'openingJournal', required: false },
                { model: JournalEntry, as: 'closingJournal', required: false },
                { model: JournalEntry, as: 'varianceJournal', required: false }
            ]
        })

        if (!drawer) return null
        return drawer
    }
}

module.exports = CashDrawerService
