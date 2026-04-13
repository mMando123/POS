/**
 * AccountingHooks - Event-driven GL integration
 *
 * Supports two modes for financial hooks:
 * 1) Blocking mode (with transaction): accounting failures rollback business tx.
 * 2) Non-blocking mode (without transaction): logs error and continues.
 */

const AccountingService = require('./accountingService')
const CashDrawerService = require('./cashDrawerService')
const logger = require('./logger')

class AccountingHooks {
    /**
     * Call after an order is completed/finalized.
     * Creates sale and COGS entries.
     */
    static async onOrderCompleted(order, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordSale(order, { transaction })
            logger.info(`Accounting: Sale recorded (atomic) for order ${order.order_number}`)

            const cogsResult = await AccountingService.recordCOGS(order, { transaction })
            if (cogsResult) {
                logger.info(`Accounting: COGS recorded (atomic) for order ${order.order_number}`)
            }
            return
        }

        try {
            await AccountingService.recordSale(order)
            logger.info(`Accounting: Sale recorded for order ${order.order_number}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for order ${order.id}:`, error.message)
        }

        try {
            const cogsResult = await AccountingService.recordCOGS(order)
            if (cogsResult) {
                logger.info(`Accounting: COGS recorded for order ${order.order_number}`)
            }
        } catch (error) {
            logger.error(`COGS hook FAILED for order ${order.id}:`, error.message)
        }
    }

    /**
     * Call after a non-cash online payment is confirmed, before revenue recognition.
     * Records a customer deposit so accounting hears the payment immediately.
     */
    static async onOnlinePaymentConfirmed(order, { transaction = null } = {}) {
        const paymentMethod = String(order?.payment_method || '').toLowerCase()
        const eligible = order?.order_type === 'online'
            && order?.payment_status === 'paid'
            && ['online', 'card', 'multi'].includes(paymentMethod)

        if (!eligible) return null

        if (transaction) {
            const entry = await AccountingService.recordCustomerDeposit(order, { transaction })
            if (entry) {
                logger.info(`Accounting: Customer deposit recorded (atomic) for order ${order.order_number}`)
            }
            return entry
        }

        try {
            const entry = await AccountingService.recordCustomerDeposit(order)
            if (entry) {
                logger.info(`Accounting: Customer deposit recorded for order ${order.order_number}`)
            }
            return entry
        } catch (error) {
            logger.error(`Customer deposit hook FAILED for order ${order?.id}:`, error.message)
            return null
        }
    }

    /**
     * Call after a refund is approved.
     * Creates refund entry and optional COGS reversal.
     */
    static async onRefundApproved(refund, originalOrder, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordRefund(refund, originalOrder, { transaction })
            logger.info(`Accounting: Refund recorded (atomic) for refund ${refund.refund_number || refund.id}`)

            if (refund.stock_restored) {
                const cogsResult = await AccountingService.recordRefundCOGSReversal(refund, originalOrder, { transaction })
                if (cogsResult) {
                    logger.info(`Accounting: COGS reversed (atomic) for refund ${refund.refund_number || refund.id}`)
                }
            }
            return
        }

        try {
            await AccountingService.recordRefund(refund, originalOrder)
            logger.info(`Accounting: Refund recorded for refund ${refund.refund_number || refund.id}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for refund ${refund.id}:`, error.message)
        }

        if (refund.stock_restored) {
            try {
                const cogsResult = await AccountingService.recordRefundCOGSReversal(refund, originalOrder)
                if (cogsResult) {
                    logger.info(`Accounting: COGS reversed for refund ${refund.refund_number || refund.id}`)
                }
            } catch (error) {
                logger.error(`COGS reversal hook FAILED for refund ${refund.id}:`, error.message)
            }
        }
    }

    /**
     * Call after purchase receipt is received.
     */
    static async onPurchaseReceived(receipt, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordPurchaseReceipt(receipt, { transaction })
            logger.info(`Accounting: Purchase receipt recorded (atomic) for ${receipt.receipt_number || receipt.id}`)

            await this._syncSupplierBalanceForReceipt(receipt, { transaction })
            return
        }

        try {
            await AccountingService.recordPurchaseReceipt(receipt)
            logger.info(`Accounting: Purchase receipt recorded for ${receipt.receipt_number || receipt.id}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for purchase receipt ${receipt.id}:`, error.message)
        }

        await this._syncSupplierBalanceForReceipt(receipt)
    }

    /**
     * Internal helper: sync supplier balance after purchase receipt.
     */
    static async _syncSupplierBalanceForReceipt(receipt, { transaction = null } = {}) {
        try {
            const { PurchaseOrder } = require('../models')
            let supplierId = receipt.supplier_id

            if (!supplierId && receipt.purchase_order_id) {
                const po = await PurchaseOrder.findByPk(
                    receipt.purchase_order_id,
                    transaction ? { transaction } : {}
                )
                if (po) supplierId = po.supplier_id
            }

            if (supplierId) {
                const result = await AccountingService.syncSupplierBalance(
                    supplierId,
                    transaction ? { transaction } : {}
                )
                logger.info(`Supplier balance synced after receipt: ${result.supplierCode} = ${result.newBalance} (was ${result.oldBalance})`)
            }
        } catch (err) {
            if (transaction) throw err
            logger.error(`Failed to sync supplier balance for receipt ${receipt.id}:`, err.message)
        }
    }

    /**
     * Call after supplier payment is recorded.
     */
    static async onSupplierPayment(payment, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordSupplierPayment(payment, { transaction })
            logger.info(`Accounting: Supplier payment recorded (atomic) for ${payment.payment_number}`)

            if (payment.supplier_id) {
                const result = await AccountingService.syncSupplierBalance(payment.supplier_id, { transaction })
                logger.info(`Supplier balance synced after payment: ${result.supplierCode} = ${result.newBalance} (was ${result.oldBalance})`)
            }

            await this._updatePOPaymentStatus(payment, { transaction })
            return
        }

        try {
            await AccountingService.recordSupplierPayment(payment)
            logger.info(`Accounting: Supplier payment recorded for ${payment.payment_number}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for supplier payment ${payment.id}:`, error.message)
        }

        try {
            if (payment.supplier_id) {
                const result = await AccountingService.syncSupplierBalance(payment.supplier_id)
                logger.info(`Supplier balance synced after payment: ${result.supplierCode} = ${result.newBalance} (was ${result.oldBalance})`)
            }
        } catch (err) {
            logger.error(`Failed to sync supplier balance for payment ${payment.payment_number}:`, err.message)
        }

        await this._updatePOPaymentStatus(payment)
    }

    /**
     * Internal helper: update purchase order payment status.
     */
    static async _updatePOPaymentStatus(payment, { transaction = null } = {}) {
        try {
            const { PurchaseOrder } = require('../models')

            if (payment.purchase_order_id) {
                const po = await PurchaseOrder.findByPk(
                    payment.purchase_order_id,
                    transaction ? { transaction } : {}
                )

                if (po) {
                    const newPaid = parseFloat(po.paid_amount || 0) + parseFloat(payment.amount || 0)
                    const total = parseFloat(po.total_amount || 0)

                    let paymentStatus = po.payment_status
                    if (newPaid >= total) paymentStatus = 'paid'
                    else if (newPaid > 0) paymentStatus = 'partial'

                    await po.update(
                        { paid_amount: newPaid, payment_status: paymentStatus },
                        transaction ? { transaction } : {}
                    )

                    logger.info(`Accounting: Updated PO ${po.po_number}: Paid ${newPaid}/${total}`)
                }
            }
        } catch (err) {
            if (transaction) throw err
            logger.error(`Failed to update PO for payment ${payment.payment_number}:`, err.message)
        }
    }

    /**
     * Call after stock adjustment is approved.
     */
    static async onStockAdjusted(adjustment, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordStockAdjustment(adjustment, { transaction })
            logger.info(`Accounting: Stock adjustment recorded (atomic) for ${adjustment.id}`)
            return
        }

        try {
            await AccountingService.recordStockAdjustment(adjustment)
            logger.info(`Accounting: Stock adjustment recorded for ${adjustment.id}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for adjustment ${adjustment.id}:`, error.message)
        }
    }

    /**
     * Call after purchase return is confirmed.
     */
    static async onPurchaseReturn(purchaseReturn, { transaction = null } = {}) {
        if (transaction) {
            await AccountingService.recordPurchaseReturn(purchaseReturn, { transaction })
            logger.info(`Accounting: Purchase return recorded (atomic) for ${purchaseReturn.return_number}`)

            if (purchaseReturn.supplier_id) {
                const result = await AccountingService.syncSupplierBalance(purchaseReturn.supplier_id, { transaction })
                logger.info(`Supplier balance synced after return: ${result.supplierCode} = ${result.newBalance}`)
            }
            return
        }

        try {
            await AccountingService.recordPurchaseReturn(purchaseReturn)
            logger.info(`Accounting: Purchase return recorded for ${purchaseReturn.return_number}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for purchase return ${purchaseReturn.id}:`, error.message)
        }
    }

    /**
     * Call when a shift opens.
     * Shift hooks are intentionally non-blocking.
     */
    static async onShiftOpened(shift) {
        try {
            await CashDrawerService.openDrawer({
                shiftId: shift.id,
                userId: shift.user_id,
                branchId: shift.branch_id,
                openingBalance: parseFloat(shift.starting_cash || 0)
            })
            logger.info(`Accounting: Drawer opened for shift ${shift.id}`)
        } catch (error) {
            logger.error(`Accounting hook FAILED for shift open ${shift.id}:`, error.message)
        }
    }

    /**
     * Call when a shift closes.
     */
    static async onShiftClosed(shift) {
        try {
            const result = await CashDrawerService.closeDrawer({
                shiftId: shift.id,
                actualBalance: parseFloat(shift.ending_cash || 0),
                userId: shift.user_id,
                notes: shift.notes || ''
            })
            logger.info(`Accounting: Drawer closed for shift ${shift.id}, variance: ${result.summary.variance}`)
            return result
        } catch (error) {
            logger.error(`Accounting hook FAILED for shift close ${shift.id}:`, error.message)
        }
    }

    /**
     * Reconcile historical inconsistent orders:
     * status = completed while payment_status = pending.
     *
     * Default strategy: reopen_order
     * Alternative strategy: mark_paid
     */
    static async reconcileCompletedPendingOrders({
        branchId,
        limit = 1000,
        dryRun = false,
        strategy = 'reopen_order'
    } = {}) {
        const { Order, JournalEntry } = require('../models')

        try {
            const orders = await Order.findAll({
                where: {
                    status: 'completed',
                    payment_status: 'pending',
                    ...(branchId ? { branch_id: branchId } : {})
                },
                order: [['updated_at', 'ASC']],
                limit
            })

            const mode = strategy === 'mark_paid' ? 'mark_paid' : 'reopen_order'
            let fixed = 0
            let failed = 0
            let reopened = 0
            let markedPaid = 0
            const details = []

            for (const order of orders) {
                const existingRevenue = await JournalEntry.findOne({
                    where: { source_type: 'order', source_id: order.id },
                    attributes: ['id', 'entry_number']
                })

                if (dryRun) {
                    details.push({
                        orderId: order.id,
                        orderNumber: order.order_number,
                        action: mode,
                        hasRevenueEntry: !!existingRevenue,
                        revenueEntryNumber: existingRevenue?.entry_number || null
                    })
                    continue
                }

                try {
                    const ts = new Date().toISOString()
                    if (mode === 'mark_paid') {
                        await order.update({
                            payment_status: 'paid',
                            notes: order.notes
                                ? `${order.notes}\n[AUTO-FIX ${ts}] payment_status updated from pending to paid during integrity reconciliation.`
                                : `[AUTO-FIX ${ts}] payment_status updated from pending to paid during integrity reconciliation.`
                        })
                        markedPaid++
                    } else {
                        await order.update({
                            status: 'handed_to_cashier',
                            completed_at: null,
                            notes: order.notes
                                ? `${order.notes}\n[AUTO-FIX ${ts}] status rolled back from completed to handed_to_cashier because payment_status is pending.`
                                : `[AUTO-FIX ${ts}] status rolled back from completed to handed_to_cashier because payment_status is pending.`
                        })
                        reopened++
                    }

                    fixed++
                    details.push({
                        orderId: order.id,
                        orderNumber: order.order_number,
                        action: mode,
                        hasRevenueEntry: !!existingRevenue,
                        revenueEntryNumber: existingRevenue?.entry_number || null
                    })
                } catch (err) {
                    failed++
                    details.push({
                        orderId: order.id,
                        orderNumber: order.order_number,
                        action: mode,
                        error: err.message
                    })
                    logger.error(`Order integrity reconciliation failed for order ${order.id}:`, err.message)
                }
            }

            logger.info(`Accounting integrity reconcile complete: total=${orders.length}, fixed=${fixed}, failed=${failed}, reopened=${reopened}, markedPaid=${markedPaid}, dryRun=${dryRun}`)

            return {
                total: orders.length,
                fixed,
                failed,
                reopened,
                markedPaid,
                dryRun,
                strategy: mode,
                details
            }
        } catch (error) {
            logger.error('Order integrity reconciliation failed:', error.message)
            throw error
        }
    }

    /**
     * Backfill journal entries for historical orders.
     * Supports optional historical COGS estimation.
     */
    static async backfillOrders({
        branchId,
        limit = 100,
        estimateMissingCOGS = false
    } = {}) {
        const { Order, JournalEntry } = require('../models')
        const { Op } = require('sequelize')

        try {
            const orders = await Order.findAll({
                where: {
                    status: 'completed',
                    payment_status: { [Op.in]: ['paid', 'refunded', 'partially_refunded'] },
                    ...(branchId ? { branch_id: branchId } : {})
                },
                order: [['completed_at', 'ASC']],
                limit
            })

            let processed = 0
            let cogsProcessed = 0
            let cogsEstimated = 0
            let skipped = 0

            for (const order of orders) {
                const existingRevJE = await JournalEntry.findOne({
                    where: { source_type: 'order', source_id: order.id }
                })

                if (!existingRevJE) {
                    try {
                        await AccountingService.recordSale(order)
                        processed++
                    } catch (err) {
                        logger.error(`Backfill revenue failed for order ${order.id}:`, err.message)
                    }
                } else {
                    skipped++
                }

                const existingCogsJE = await JournalEntry.findOne({
                    where: { source_type: 'order_cogs', source_id: order.id }
                })

                if (!existingCogsJE) {
                    try {
                        const cogsResult = await AccountingService.recordCOGS(order, {
                            allowEstimate: estimateMissingCOGS
                        })

                        if (cogsResult) {
                            cogsProcessed++

                            try {
                                const notes = cogsResult.notes
                                    ? (typeof cogsResult.notes === 'string' ? JSON.parse(cogsResult.notes) : cogsResult.notes)
                                    : null
                                if (notes && notes.cogs_estimated) cogsEstimated++
                            } catch (_) {
                                // no-op, notes may be free text
                            }
                        }
                    } catch (err) {
                        logger.error(`Backfill COGS failed for order ${order.id}:`, err.message)
                    }
                }
            }

            logger.info(`Accounting backfill complete: ${processed} revenue + ${cogsProcessed} COGS (${cogsEstimated} estimated) processed, ${skipped} skipped`)
            return {
                processed,
                cogsProcessed,
                cogsEstimated,
                skipped,
                total: orders.length,
                estimateMissingCOGS
            }
        } catch (error) {
            logger.error('Backfill failed:', error.message)
            throw error
        }
    }

    /**
     * Backfill purchase receipt journal entries for historical data.
     */
    static async backfillPurchaseReceipts({ limit = 1000 } = {}) {
        const { PurchaseReceipt, PurchaseOrder, JournalEntry } = require('../models')
        const { Op } = require('sequelize')

        try {
            const receipts = await PurchaseReceipt.findAll({
                where: { status: { [Op.in]: ['received', 'partial'] } },
                order: [['created_at', 'ASC']],
                limit
            })

            let processed = 0
            let skipped = 0
            let syncedSuppliers = 0

            for (const receipt of receipts) {
                const existingJE = await JournalEntry.findOne({
                    where: { source_type: 'purchase_receipt', source_id: receipt.id }
                })

                if (existingJE) {
                    skipped++
                    continue
                }

                try {
                    await AccountingService.recordPurchaseReceipt(receipt)
                    processed++

                    let supplierId = receipt.supplier_id
                    if (!supplierId && receipt.purchase_order_id) {
                        const po = await PurchaseOrder.findByPk(receipt.purchase_order_id, {
                            attributes: ['supplier_id']
                        })
                        if (po) supplierId = po.supplier_id
                    }

                    if (supplierId) {
                        await AccountingService.syncSupplierBalance(supplierId)
                        syncedSuppliers++
                    }
                } catch (err) {
                    logger.error(`Backfill purchase receipt failed for receipt ${receipt.id}:`, err.message)
                }
            }

            logger.info(`Purchase receipts backfill complete: ${processed} processed, ${skipped} skipped, ${syncedSuppliers} supplier balances synced`)
            return { processed, skipped, syncedSuppliers, total: receipts.length }
        } catch (error) {
            logger.error('Purchase receipts backfill failed:', error.message)
            throw error
        }
    }
}

module.exports = AccountingHooks
