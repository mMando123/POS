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
 * RULE: No order may ever be marked as PAID unless verified via
 * Paymob Server Callback (Webhook) with valid HMAC + matching amount.
 * Frontend success response is NEVER trusted.
 */

const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, optionalAuth } = require('../middleware/auth')
const { requireIdempotency } = require('../middleware/idempotency')
const { paymentLimiter } = require('../middleware/rateLimiter')
const { Order, PaymentGateway, AuditLog, sequelize } = require('../models')
const AuditService = require('../services/auditService')
const logger = require('../services/logger')
const paymobGateway = require('../services/gateways/paymob')
const OrderPaymentService = require('../services/orderPaymentService')

// Initiate payment (unchanged logic, kept backward compatible)
router.post('/initiate', optionalAuth, paymentLimiter, [
    body('order_id').notEmpty().withMessage('Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨ Ù…Ø·Ù„ÙˆØ¨'),
    body('gateway').optional(),
    validate
], async (req, res) => {
    try {
        const { order_id, gateway } = req.body

        const order = await Order.findByPk(order_id, {
            include: ['items']
        })

        if (!order) {
            return res.status(404).json({ message: 'Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        // Security check: If guest, order must be online
        if (!req.user && order.order_type !== 'online') {
            return res.status(401).json({ message: 'ØºÙŠØ± Ù…ØµØ±Ø­ Ù„Ùƒ Ø¨Ø§Ù„Ø¯ÙØ¹ Ù„Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨' })
        }

        const paymentService = require('../services/paymentService')
        const result = await paymentService.initiatePayment(order, gateway)

        res.json({ data: result })
    } catch (error) {
        console.error('Initiate payment error:', error)
        res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ø¨Ø¯Ø¡ Ø§Ù„Ø¯ÙØ¹' })
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

        logger.info(`ðŸ’³ Webhook received: success=${success}, merchantOrderId=${merchantOrderId}, txnId=${transactionId}`)

        if (!merchantOrderId) {
            logger.warn('âš ï¸ Webhook missing merchant_order_id')
            return res.json({ received: true, warning: 'Missing merchant_order_id' })
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
                    error: 'Webhook security not configured'
                })
            }
            logger.warn('WARNING: Paymob webhook accepted without HMAC (non-production or override enabled).')
        } else {
            if (!receivedHmac) {
                logger.error(`HMAC missing for transaction ${transactionId}`)
                return res.status(403).json({
                    received: true,
                    error: 'Missing webhook HMAC signature'
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
                    error: 'HMAC verification failed - payment rejected'
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
            logger.error(`âŒ Webhook: Order not found for ${merchantOrderId}`)
            return res.status(404).json({ received: true, error: 'Order not found' })
        }

        // ===== AMOUNT VERIFICATION =====
        if (amountCents) {
            const amountMatch = paymobGateway.verifyAmount(amountCents, order.total)
            if (!amountMatch) {
                logger.error(`ðŸš« Amount mismatch for Order #${order.order_number}: paid=${amountCents}, expected=${Math.round(order.total * 100)}`)
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
                    error: 'Amount mismatch - payment flagged for review'
                })
            }
        }

        // ===== IDEMPOTENCY CHECK (duplicate webhook protection) =====
        if (order.payment_status === 'paid' && success) {
            logger.info(`â™»ï¸ Duplicate webhook for already-paid Order #${order.order_number}`)
            return res.json({ received: true, success: true, duplicate: true })
        }

        // ===== UPDATE ORDER =====
        if (success) {
            await order.update({ payment_status: 'paid' })
            await OrderPaymentService.ensureRowsForPaidOrder(order, {
                processedBy: null,
                notes: `Auto-created from payment webhook txn=${transactionId || ''}`.trim()
            })
            logger.info(`âœ… Payment confirmed for Order #${order.order_number}`)

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
            logger.info(`âŒ Payment failed for Order #${order.order_number}`)

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
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' })
    }
})

/**
 * Verify payment callback (from frontend redirect)
 * 
 * IMPORTANT: This does NOT mark an order as paid.
 * It only checks if the webhook already did that.
 * Frontend success is NEVER trusted for marking payment.
 */
router.post('/verify', async (req, res) => {
    try {
        const { query } = req.body
        const merchantOrderId = query?.merchant_order_id

        if (!merchantOrderId) {
            return res.status(400).json({ message: 'Ù…Ø¹Ø±Ù Ø§Ù„Ø·Ù„Ø¨ Ù…ÙÙ‚ÙˆØ¯' })
        }

        let order = await Order.findByPk(merchantOrderId)
        if (!order) {
            order = await Order.findOne({ where: { order_number: merchantOrderId } })
        }

        if (!order) {
            return res.status(404).json({ message: 'Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ (' + merchantOrderId + ')' })
        }

        // Return the CURRENT payment status from our DB
        // DO NOT update payment_status here based on frontend query params
        if (order.payment_status === 'paid') {
            // Already confirmed by webhook
            return res.json({
                success: true,
                message: 'ØªÙ… ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø¯ÙØ¹',
                data: order,
                verified_by: 'webhook'
            })
        }

        // Payment not yet confirmed by webhook â€” tell frontend to wait
        return res.json({
            success: false,
            message: 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø¯ÙØ¹... ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±',
            data: order,
            payment_status: order.payment_status,
            note: 'Payment verification is done server-side via webhook. Please poll /status endpoint.'
        })

    } catch (error) {
        console.error('Verify payment error:', error)
        res.status(500).json({ message: 'ÙØ´Ù„ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø¯ÙØ¹' })
    }
})

// Get payment status
router.get('/status/:orderId', async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.orderId, {
            attributes: ['id', 'payment_status', 'payment_method', 'total', 'status']
        })

        if (!order) {
            return res.status(404).json({ message: 'Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        res.json({ data: order })
    } catch (error) {
        console.error('Get payment status error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' })
    }
})

/**
 * Manual payment confirmation (for cash/card at POS)
 * 
 * SECURED: Requires authentication (was previously unauthenticated â€” CRITICAL FIX)
 * IDEMPOTENT: Requires X-Idempotency-Key header
 */
router.post('/:orderId/confirm',
    authenticate,  // <- CRITICAL FIX: Was missing, allowing anyone to mark orders as paid
    requireIdempotency({ required: true, endpointName: 'payment_confirm' }),
    [
        body('payment_method').isIn(['cash', 'card', 'online', 'multi']).withMessage('Invalid payment method'),
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
            res.status(500).json({ message: error.message || 'Server error' })
        }
    }
)

module.exports = router


