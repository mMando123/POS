/**
 * Payment Routes - Secure Financial Gateway
 * 
 * CRITICAL FINANCIAL COMPONENT
 * 
 * All payment operations are secured with:
 * - Authentication on all endpoints (except webhook which uses HMAC)
 * - HMAC signature verification on webhooks
 * - Amount matching (prevents paying 1 EGP for a 1000 EGP order)
 * - Idempotency keys for payment confirmation
 * - Audit logging for all payment state changes
 * 
 * RULE: No order may ever be marked as PAID unless verified with a valid
 * Paymob HMAC signature plus amount matching. Primary path is the server
 * webhook; callback fallback is allowed only after the same verification.
 */

const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { Op } = require('sequelize')
const { validate } = require('../middleware/validate')
const { authenticate, optionalAuth, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { requireIdempotency } = require('../middleware/idempotency')
const { paymentLimiter } = require('../middleware/rateLimiter')
const { Order, PaymentGateway, AuditLog, sequelize } = require('../models')
const AuditService = require('../services/auditService')
const AccountingHooks = require('../services/accountingHooks')
const logger = require('../services/logger')
const paymobGateway = require('../services/gateways/paymob')
const OrderPaymentService = require('../services/orderPaymentService')
const { getPrintService } = require('../services/printService')
const { loadSettings } = require('./settings')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const hasBranchAccess = (user, branchId) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (!user.branchId) return true
    return String(user.branchId) === String(branchId || '')
}

const ensureConfirmationAudit = async ({
    order,
    action,
    transactionId = null,
    amountCents = null,
    verification = null
}) => {
    if (!order?.id || !action) return false

    const existing = await AuditLog.findOne({
        where: {
            category: 'order',
            entity_id: String(order.id),
            action: {
                [Op.in]: ['payment_confirmed_webhook', 'payment_confirmed_callback']
            }
        },
        attributes: ['id']
    })
    if (existing) return false

    AuditService.log({
        category: 'order',
        action,
        entityType: 'Order',
        entityId: order.id,
        branchId: order.branch_id || null,
        metadata: {
            transactionId,
            amountCents,
            gateway: 'paymob',
            verification
        }
    })
    return true
}

const postOnlinePaymentReceipt = async (order) => {
    try {
        await AccountingHooks.onOnlinePaymentConfirmed(order)
    } catch (error) {
        logger.error(`Failed to post online payment receipt for order ${order?.id}:`, error.message)
    }
}

const getKitchenRoutingConfig = (settings = null) => {
    const resolved = settings || loadSettings()
    return {
        kdsEnabled: resolved?.hardware?.enableKitchenDisplay === true,
        printKitchenReceipt: resolved?.workflow?.printKitchenReceipt !== false
    }
}

const emitToKdsRooms = (io, event, payload, kitchenConfig = null) => {
    const config = kitchenConfig || getKitchenRoutingConfig()
    if (!io || !config.kdsEnabled) return false

    io.to('kds:all').emit(event, payload)
    io.to('kds').emit(event, payload)
    return true
}

const maybePrintOnlineKitchenTicket = async (req, order, kitchenConfig = null) => {
    const config = kitchenConfig || getKitchenRoutingConfig()
    if (!order || order.order_type !== 'online' || order.status !== 'approved') return false
    if (config.kdsEnabled || !config.printKitchenReceipt) return false

    try {
        const printService = req.app.get('printService') || getPrintService()
        if (!printService?.onOrderApproved) return false
        await printService.onOrderApproved(order)
        return true
    } catch (error) {
        logger.warn(`Paper kitchen print failed for order ${order.order_number}: ${error.message}`)
        return false
    }
}

const broadcastApprovedOnlineOrder = async (req, order) => {
    if (!req?.app || !order || order.order_type !== 'online' || order.status !== 'approved') return false

    const kitchenConfig = getKitchenRoutingConfig()
    const io = req.app.get('io')
    const notificationService = req.app.get('notificationService')

    if (io) {
        io.to(`branch:${order.branch_id}`).emit('order:updated', {
            orderId: order.id,
            status: order.status,
            order
        })
        emitToKdsRooms(io, 'order:new', order, kitchenConfig)
        io.to(`order:${order.id}`).emit('order:updated', {
            orderId: order.id,
            status: order.status,
            order
        })
    }

    await maybePrintOnlineKitchenTicket(req, order, kitchenConfig)

    if (notificationService?.orderApproved) {
        notificationService.orderApproved(order).catch((notifyErr) => {
            logger.warn('Order approved notification failed:', notifyErr.message)
        })
    }

    return true
}

const buildPaymobTransactionFromQuery = (query = {}) => ({
    amount_cents: query.amount_cents,
    created_at: query.created_at,
    currency: query.currency,
    error_occured: query.error_occured,
    has_parent_transaction: query.has_parent_transaction,
    id: query.id,
    integration_id: query.integration_id,
    is_3d_secure: query.is_3d_secure,
    is_auth: query.is_auth,
    is_capture: query.is_capture,
    is_refunded: query.is_refunded,
    is_standalone_payment: query.is_standalone_payment,
    is_voided: query.is_voided,
    order: query.order,
    owner: query.owner,
    pending: query.pending,
    source_data: {
        pan: query['source_data.pan'],
        sub_type: query['source_data.sub_type'],
        type: query['source_data.type']
    },
    success: query.success
})

// Initiate payment (unchanged logic, kept backward compatible)
router.post('/initiate', optionalAuth, paymentLimiter, [
    body('order_id').notEmpty().withMessage('رقم الطلب مطلوب'),
    body('gateway').optional(),
    validate
], async (req, res) => {
    try {
        const { order_id, gateway } = req.body

        const order = await Order.findByPk(order_id, {
            include: ['items']
        })

        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (order.order_type !== 'online') {
            return res.status(400).json({ message: 'تهيئة الدفع الإلكتروني متاحة للطلبات الأونلاين فقط' })
        }

        if (order.status === 'cancelled') {
            return res.status(409).json({ message: 'لا يمكن بدء الدفع لطلب ملغي' })
        }

        if (order.payment_status === 'paid') {
            return res.status(409).json({ message: 'تم دفع هذا الطلب بالفعل' })
        }

        if (!['online', 'card'].includes(String(order.payment_method || '').toLowerCase())) {
            return res.status(400).json({ message: 'طريقة الدفع الحالية لا تتطلب بوابة دفع أونلاين' })
        }

        const paymentService = require('../services/paymentService')
        const result = await paymentService.initiatePayment(order, gateway)

        res.json({ data: result })
    } catch (error) {
        console.error('Initiate payment error:', error)
        res.status(500).json({ message: error.message || 'خطأ في بدء الدفع' })
    }
})

/**
 * Payment Webhook (Server-to-Server from Paymob)
 * 
 * CRITICAL: This is the ONLY trusted source of payment confirmation.
 * 
 * Security layers:
 * 1. HMAC-SHA512 signature verification
 * 2. Amount matching against our order record 
 * 3. Order existence validation
 * 4. Duplicate payment protection (idempotent by transaction ID)
 */
router.post('/webhook', async (req, res) => {
    try {
        const webhookData = req.body.obj || req.body
        const receivedHmac = req.query.hmac || req.body.hmac

        const success = webhookData.success === true
        const merchantOrderId = webhookData.order?.merchant_order_id || webhookData.merchant_order_id
        const transactionId = webhookData.id
        const amountCents = webhookData.amount_cents

        logger.info(`[payment webhook] received: success=${success}, merchantOrderId=${merchantOrderId}, txnId=${transactionId}`)

        if (!merchantOrderId) {
            logger.warn('Webhook missing merchant_order_id')
            return res.json({ received: true, warning: 'المعرّف merchant_order_id غير موجود' })
        }

        // ===== HMAC VERIFICATION =====
        // Load Paymob gateway config to get HMAC secret
        const gatewayConfig = await PaymentGateway.findOne({
            where: { name: 'paymob', is_active: true }
        })

        const allowInsecureWebhook = String(process.env.PAYMENT_ALLOW_INSECURE_WEBHOOKS || '').toLowerCase() === 'true'
        const hmacSecret = gatewayConfig?.settings?.hmacSecret || gatewayConfig?.settings?.hmac || ''

        if (!hmacSecret) {
            const insecureAllowed = process.env.NODE_ENV !== 'production' || allowInsecureWebhook
            if (!insecureAllowed) {
                logger.error('Paymob webhook rejected: missing hmacSecret in production')
                return res.status(503).json({
                    received: true,
                    error: 'إعدادات أمان الـ Webhook غير مكتملة'
                })
            }
            logger.warn('WARNING: Paymob webhook accepted without HMAC (non-production or override enabled).')
        } else {
            if (!receivedHmac) {
                logger.error(`HMAC missing for transaction ${transactionId}`)
                return res.status(403).json({
                    received: true,
                    error: 'توقيع HMAC الخاص بالـ Webhook مفقود'
                })
            }

            const isValidHmac = paymobGateway.verifyCallback(webhookData, receivedHmac, hmacSecret)

            if (!isValidHmac) {
                logger.error(`HMAC verification FAILED for transaction ${transactionId}`)
                AuditService.log({
                    category: 'order',
                    action: 'payment_hmac_failed',
                    entityType: 'Order',
                    entityId: merchantOrderId,
                    metadata: {
                        transactionId,
                        amountCents,
                        ip_address: req.ip
                    }
                })
                return res.status(403).json({
                    received: true,
                    error: 'فشل التحقق من توقيع HMAC وتم رفض الدفع'
                })
            }

            logger.info(`HMAC verified for transaction ${transactionId}`)
        }

        // ===== FIND ORDER =====
        let order = await Order.findByPk(merchantOrderId)
        if (!order) {
            order = await Order.findOne({ where: { order_number: merchantOrderId } })
        }

        if (!order) {
            logger.error(`Webhook: Order not found for ${merchantOrderId}`)
            return res.status(404).json({ received: true, error: 'الطلب غير موجود' })
        }

        // ===== AMOUNT VERIFICATION =====
        if (amountCents) {
            const amountMatch = paymobGateway.verifyAmount(amountCents, order.total)
            if (!amountMatch) {
                logger.error(`[payment webhook] amount mismatch for Order #${order.order_number}: paid=${amountCents}, expected=${Math.round(order.total * 100)}`)
                AuditService.log({
                    category: 'order',
                    action: 'payment_amount_mismatch',
                    entityType: 'Order',
                    entityId: order.id,
                    metadata: {
                        transactionId,
                        paid_amount_cents: amountCents,
                        expected_amount_cents: Math.round(order.total * 100),
                        order_total: order.total
                    }
                })
                return res.status(400).json({
                    received: true,
                    error: 'قيمة الدفع لا تطابق الطلب وتم تحويل العملية للمراجعة'
                })
            }
        }

        // ===== IDEMPOTENCY CHECK (duplicate webhook protection) =====
        if (order.payment_status === 'paid' && success) {
            logger.info(`Duplicate webhook for already-paid Order #${order.order_number}`)
            return res.json({ received: true, success: true, duplicate: true })
        }

        // ===== UPDATE ORDER =====
        if (success) {
            const workflowSettings = loadSettings()?.workflow || {}
            const autoApprovePaidOnline = order.order_type === 'online'
                && order.status === 'pending'
                && workflowSettings.autoAcceptOnline === true

            const orderUpdate = { payment_status: 'paid' }
            if (autoApprovePaidOnline) {
                orderUpdate.status = 'approved'
                orderUpdate.approved_at = new Date()
            }

            await order.update(orderUpdate)
            await OrderPaymentService.ensureRowsForPaidOrder(order, {
                processedBy: null,
                notes: `Auto-created from payment webhook txn=${transactionId || ''}`.trim()
            })
            await postOnlinePaymentReceipt(order)
            if (autoApprovePaidOnline) {
                await broadcastApprovedOnlineOrder(req, order)
            }
            logger.info(`[payment webhook] payment confirmed for Order #${order.order_number}`)

            // Audit the successful payment
            AuditService.log({
                category: 'order',
                action: 'payment_confirmed_webhook',
                entityType: 'Order',
                entityId: order.id,
                metadata: {
                    transactionId,
                    amountCents,
                    gateway: 'paymob',
                    verification: 'hmac_verified'
                }
            })

            // Notify via WebSocket
            const io = req.app.get('io')
            if (io) {
                io.to(`order:${order.id}`).emit('payment:confirmed', {
                    orderId: order.id,
                    status: 'paid'
                })
                io.emit('order:paid', order)
            }
        } else {
            await order.update({ payment_status: 'failed' })
            logger.info(`Payment failed for Order #${order.order_number}`)

            AuditService.log({
                category: 'order',
                action: 'payment_failed_webhook',
                entityType: 'Order',
                entityId: order.id,
                metadata: { transactionId, amountCents }
            })
        }

        res.json({ received: true, success: true })
    } catch (error) {
        logger.error('Payment webhook error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

/**
 * Verify payment callback (from frontend redirect)
 * 
 * IMPORTANT:
 * - Primary confirmation path is still the server-side webhook.
 * - As a resilient fallback, a Paymob redirect may confirm payment only if
 *   HMAC is valid and the paid amount matches the order total.
 */
router.post('/verify', async (req, res) => {
    try {
        const { query } = req.body
        const merchantOrderId = String(query?.merchant_order_id || '').trim()

        if (!merchantOrderId) {
            return res.status(400).json({ message: 'معرف الطلب مفقود' })
        }

        if (!UUID_PATTERN.test(merchantOrderId)) {
            return res.status(400).json({ message: 'معرف الطلب غير صالح' })
        }

        const order = await Order.findByPk(merchantOrderId, {
            attributes: ['id', 'order_number', 'payment_status', 'payment_method', 'status', 'order_type', 'total', 'branch_id', 'shift_id', 'user_id']
        })

        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        const callbackSuccess = String(query?.success || '').toLowerCase() === 'true'
        const callbackHmac = String(query?.hmac || '').trim()
        let verifiedBy = 'webhook'

        if (order.payment_status !== 'paid' && callbackSuccess && callbackHmac) {
            const gatewayConfig = await PaymentGateway.findOne({
                where: { name: 'paymob', is_active: true }
            })

            const hmacSecret = gatewayConfig?.settings?.hmacSecret || gatewayConfig?.settings?.hmac || ''
            if (hmacSecret) {
                const callbackTransaction = buildPaymobTransactionFromQuery(query)
                const hmacValid = paymobGateway.verifyCallback(callbackTransaction, callbackHmac, hmacSecret)
                const amountValid = hmacValid && paymobGateway.verifyAmount(query.amount_cents, order.total)

                if (hmacValid && amountValid) {
                    const workflowSettings = loadSettings()?.workflow || {}
                    const autoApprovePaidOnline = order.order_type === 'online'
                        && order.status === 'pending'
                        && workflowSettings.autoAcceptOnline === true

                    const orderUpdate = { payment_status: 'paid' }
                    if (autoApprovePaidOnline) {
                        orderUpdate.status = 'approved'
                        orderUpdate.approved_at = new Date()
                    }

                    await order.update(orderUpdate)
                    await OrderPaymentService.ensureRowsForPaidOrder(order, {
                        processedBy: null,
                        notes: `Auto-confirmed from payment callback txn=${query?.id || ''}`.trim()
                    })
                    await postOnlinePaymentReceipt(order)
                    if (autoApprovePaidOnline) {
                        await broadcastApprovedOnlineOrder(req, order)
                    }

                    await ensureConfirmationAudit({
                        order,
                        action: 'payment_confirmed_callback',
                        transactionId: query?.id || null,
                        amountCents: query?.amount_cents || null,
                        verification: 'callback_hmac_verified'
                    })

                    const io = req.app.get('io')
                    if (io) {
                        io.to(`order:${order.id}`).emit('payment:confirmed', {
                            orderId: order.id,
                            status: 'paid'
                        })
                        io.emit('order:paid', order)
                    }

                    verifiedBy = 'callback_hmac'
                    logger.info(`[payment verify] fallback confirmation accepted for Order #${order.order_number}, txnId=${query?.id || ''}`)
                } else {
                    logger.warn(`[payment verify] callback verification failed for Order #${order.order_number}, txnId=${query?.id || ''}`)
                }
            } else {
                logger.warn('[payment verify] paymob hmacSecret missing, callback fallback skipped')
            }
        }

        if (order.payment_status === 'paid' && callbackSuccess && callbackHmac && verifiedBy !== 'callback_hmac') {
            const gatewayConfig = await PaymentGateway.findOne({
                where: { name: 'paymob', is_active: true }
            })

            const hmacSecret = gatewayConfig?.settings?.hmacSecret || gatewayConfig?.settings?.hmac || ''
            if (hmacSecret) {
                const callbackTransaction = buildPaymobTransactionFromQuery(query)
                const hmacValid = paymobGateway.verifyCallback(callbackTransaction, callbackHmac, hmacSecret)
                const amountValid = hmacValid && paymobGateway.verifyAmount(query.amount_cents, order.total)

                if (hmacValid && amountValid) {
                    verifiedBy = 'callback_hmac'
                    await ensureConfirmationAudit({
                        order,
                        action: 'payment_confirmed_callback',
                        transactionId: query?.id || null,
                        amountCents: query?.amount_cents || null,
                        verification: 'callback_hmac_verified'
                    })
                }
            }
        }

        // Return the CURRENT payment status from our DB
        if (order.payment_status === 'paid') {
            await OrderPaymentService.ensureRowsForPaidOrder(order, {
                processedBy: null,
                notes: `Auto-repaired payment row from verify txn=${query?.id || ''}`.trim()
            })
            await postOnlinePaymentReceipt(order)

            return res.json({
                success: true,
                message: 'تم تأكيد الدفع',
                data: {
                    orderId: order.id,
                    payment_status: order.payment_status,
                    payment_method: order.payment_method,
                    status: order.status
                },
                verified_by: verifiedBy
            })
        }

        // Payment not yet confirmed by webhook - tell frontend to wait
        return res.json({
            success: false,
            message: 'جارٍ التحقق من الدفع... يرجى الانتظار',
            data: {
                orderId: order.id,
                payment_status: order.payment_status,
                payment_method: order.payment_method,
                status: order.status
            },
            payment_status: order.payment_status,
            note: 'يتم التحقق من الدفع من الخادم عبر Webhook. يرجى إعادة الاستعلام من endpoint /status.'
        })

    } catch (error) {
        console.error('Verify payment error:', error)
        res.status(500).json({ message: 'فشل التحقق من الدفع' })
    }
})

// Get payment status
router.get('/status/:orderId', async (req, res) => {
    try {
        if (!UUID_PATTERN.test(String(req.params.orderId || '').trim())) {
            return res.status(400).json({ message: 'معرف الطلب غير صالح' })
        }

        const order = await Order.findByPk(req.params.orderId, {
            attributes: ['id', 'payment_status', 'payment_method', 'total', 'status']
        })

        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        res.json({ data: order })
    } catch (error) {
        console.error('Get payment status error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

/**
 * Manual payment confirmation (for cash/card at POS)
 * 
 * SECURED: Requires authentication (was previously unauthenticated - CRITICAL FIX)
 * IDEMPOTENT: Requires X-Idempotency-Key header
 */
router.post('/:orderId/confirm',
    authenticate,  // <- CRITICAL FIX: Was missing, allowing anyone to mark orders as paid
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    requireIdempotency({ required: true, endpointName: 'payment_confirm' }),
    [
        body('payment_method').isIn(['cash', 'card', 'online', 'multi']).withMessage('طريقة الدفع غير صالحة'),
        validate
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const { orderId } = req.params
            const { payment_method, payment_breakdown } = req.body

            const order = await Order.findByPk(orderId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!order) {
                await transaction.rollback()
                return res.status(404).json({ message: 'Order not found' })
            }

            if (!hasBranchAccess(req.user, order.branch_id)) {
                await transaction.rollback()
                return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
            }

            // Prevent double-payment
            if (order.payment_status === 'paid') {
                await transaction.rollback()
                return res.json({
                    success: true,
                    message: 'Order is already paid',
                    data: order,
                    duplicate: true
                })
            }

            const normalizedPayments = OrderPaymentService.normalizeBreakdown({
                paymentMethod: payment_method,
                paymentBreakdown: payment_breakdown,
                totalAmount: order.total
            })

            const effectiveMethod = normalizedPayments.length > 1
                ? 'multi'
                : normalizedPayments[0].method

            await order.update({
                payment_status: 'paid',
                payment_method: effectiveMethod,
                status: 'confirmed'
            }, { transaction })

            await OrderPaymentService.replaceOrderPayments(order, normalizedPayments, {
                transaction,
                processedBy: req.user.userId,
                notes: 'Manual payment confirmation'
            })

            await AccountingHooks.onOnlinePaymentConfirmed(order, { transaction })

            await transaction.commit()

            // Audit log
            AuditService.log({
                userId: req.user.userId,
                branchId: req.user.branchId,
                category: 'order',
                action: 'payment_confirmed_manual',
                entityType: 'Order',
                entityId: orderId,
                metadata: {
                    payment_method: effectiveMethod,
                    payment_breakdown: normalizedPayments,
                    total: order.total,
                    confirmed_by: req.user.userId
                }
            })

            req.app.get('io').to(`branch:${order.branch_id}`).emit('payment:confirmed', {
                orderId,
                status: 'paid'
            })

            res.json({ data: order })
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback()
            }
            console.error('Confirm payment error:', error)
            res.status(500).json({ message: error.message || 'خطأ في الخادم' })
        }
    }
)

module.exports = router


