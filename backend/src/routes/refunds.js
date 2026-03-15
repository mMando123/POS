/**
 * Refund Routes - Bank-Grade Refund System
 * Handles all refund operations with full audit trail
 * 
 * IMPORTANT: This module uses COMPENSATING TRANSACTIONS
 * - Original orders are NEVER modified
 * - Refunds create negative entries
 * - All actions are fully auditable
 */

const express = require('express')
const router = express.Router()
const { body, param, query, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const {
    sequelize,
    Order,
    OrderItem,
    Refund,
    RefundItem,
    User,
    Shift,
    Stock,
    StockMovement,
    Warehouse,
    Menu,
    AuditLog
} = require('../models')
const { Op } = require('sequelize')

const AccountingHooks = require('../services/accountingHooks')
const { requireIdempotency } = require('../middleware/idempotency')
const { loadSettings } = require('./settings')

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique refund number
 */
async function generateRefundNumber() {
    const year = new Date().getFullYear()
    const count = await Refund.count({
        where: {
            created_at: {
                [Op.gte]: new Date(`${year}-01-01`),
                [Op.lt]: new Date(`${year + 1}-01-01`)
            }
        }
    })
    return `REF-${year}-${String(count + 1).padStart(5, '0')}`
}

/**
 * Check if order can be refunded
 */
async function validateOrderForRefund(order, refundType) {
    const errors = []

    // Check if order exists
    if (!order) {
        errors.push('الطلب غير موجود')
        return { valid: false, errors }
    }

    // Check if already fully refunded
    const existingFullRefund = await Refund.findOne({
        where: {
            order_id: order.id,
            refund_type: 'FULL_REFUND',
            status: 'completed'
        }
    })
    if (existingFullRefund) {
        errors.push('تم استرداد هذا الطلب بالكامل مسبقاً')
        return { valid: false, errors }
    }

    // For VOID: check if kitchen hasn't started
    if (refundType === 'VOID') {
        if (!['new', 'pending', 'approved', 'confirmed'].includes(order.status)) {
            errors.push('لا يمكن إلغاء الطلب بعد بدء التحضير')
            return { valid: false, errors }
        }
    }

    // For online orders: check delivery status
    if (order.order_type === 'online' || order.order_type === 'delivery') {
        if (!['completed', 'delivered', 'cancelled'].includes(order.status) && refundType !== 'VOID') {
            errors.push('لا يمكن استرداد الطلب الأونلاين إلا بعد التسليم أو الإلغاء')
            return { valid: false, errors }
        }
    }

    return { valid: true, errors: [] }
}

/**
 * Restore stock for refunded items
 * 
 * CRITICAL FIX (Phase 1):
 * - Changed movement_type from 'return_in' to 'IN' (valid StockMovement ENUM)
 * - Changed reference_type/reference_id to source_type/source_id (correct field names)
 * - Added balance_after field (required by StockMovement model)
 */
async function restoreStock(refundItems, userId, orderId, transaction) {
    const warehouse = await Warehouse.findOne({ where: { is_default: true } })
    if (!warehouse) return

    for (const item of refundItems) {
        // Find or create stock record
        const [stock] = await Stock.findOrCreate({
            where: { menu_id: item.menu_id, warehouse_id: warehouse.id },
            defaults: { quantity: 0, avg_cost: 0 },
            transaction
        })

        // Add quantity back
        await stock.increment('quantity', { by: item.refund_quantity, transaction })

        // Reload to get updated balance
        await stock.reload({ transaction })

        // Create stock movement with correct ENUM and field names
        // FIX-09: Get actual cost from original order movement instead of selling price
        const originalMovement = await StockMovement.findOne({
            where: {
                source_type: 'order',
                source_id: orderId,
                menu_id: item.menu_id,
                movement_type: 'OUT'
            },
            transaction
        })

        const actualUnitCost = originalMovement ? parseFloat(originalMovement.unit_cost) : 0
        const totalRefundCost = actualUnitCost * item.refund_quantity

        await StockMovement.create({
            menu_id: item.menu_id,
            warehouse_id: warehouse.id,
            movement_type: 'IN',  // ← FIXED: was 'return_in' which is not in the ENUM
            quantity: item.refund_quantity,
            unit_cost: actualUnitCost,        // ← FIX-09: Replaced item.unit_price (selling price) with actual cost
            total_cost: totalRefundCost,      // ← FIX-09: Replaced qty*price with qty*cost
            balance_after: parseFloat(stock.quantity),
            source_type: 'refund',
            source_id: item.refund_id,
            notes: `مرتجع من الطلب - استرداد #${item.refund_id}`,
            user_id: userId
        }, { transaction })

        // Update refund item
        await RefundItem.update(
            { stock_restored: true, warehouse_id: warehouse.id },
            { where: { id: item.id }, transaction }
        )
    }
}

/**
 * Create audit log for refund
 */
async function logRefundAction(action, refund, user, req, transaction) {
    await AuditLog.create({
        user_id: user.userId,
        branch_id: user.branchId,
        category: 'order',
        action: `refund_${action}`,
        entity_type: 'refund',
        entity_id: refund.id,
        old_value: null,
        new_value: JSON.stringify({
            refund_number: refund.refund_number,
            refund_type: refund.refund_type,
            amount: refund.refund_amount,
            order_id: refund.order_id
        }),
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent')
    }, { transaction })
}

// ==================== ROUTES ====================

/**
 * POST /api/refunds
 * Process a full refund for an order
 */
router.post('/',
    authenticate,
    requireIdempotency({ required: false, endpointName: 'refund_create' }), // Ideally true in prod
    authorize('admin', 'supervisor', 'manager', 'cashier'),
    [
        body('order_id').isUUID().withMessage('معرف الطلب غير صالح'),
        body('refund_reason').notEmpty().withMessage('سبب الاسترداد مطلوب'),
        body('refund_category').optional().isIn([
            'customer_request', 'quality_issue', 'wrong_order',
            'delivery_issue', 'payment_issue', 'duplicate_order',
            'system_error', 'other'
        ])
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                await transaction.rollback()
                return res.status(400).json({ errors: errors.array() })
            }

            const { order_id, refund_reason, refund_category = 'customer_request' } = req.body

            // Get order with items
            const order = await Order.findByPk(order_id, {
                include: [{ model: OrderItem, as: 'items', include: [Menu] }]
            })

            // Validate order for refund
            const validation = await validateOrderForRefund(order, 'FULL_REFUND')
            if (!validation.valid) {
                await transaction.rollback()
                return res.status(400).json({ message: validation.errors.join(', ') })
            }

            // Check: Cashier cannot refund their own orders
            if (order.user_id === req.user.userId && req.user.role !== 'admin') {
                await transaction.rollback()
                return res.status(403).json({ message: 'لا يمكنك استرداد طلباتك الخاصة' })
            }

            // Get current shift
            const currentShift = await Shift.findOne({
                where: { user_id: req.user.userId, status: 'open' }
            })

            // Generate refund number
            const refundNumber = await generateRefundNumber()

            // Create order snapshot
            const orderSnapshot = {
                order_number: order.order_number,
                order_type: order.order_type,
                status: order.status,
                total: order.total,
                subtotal: order.subtotal,
                tax: order.tax,
                discount: order.discount,
                payment_method: order.payment_method,
                items: order.items.map(item => ({
                    id: item.id,
                    menu_id: item.menu_id,
                    name: item.Menu?.name_ar,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_price: item.total_price
                })),
                created_at: order.created_at
            }

            // Create refund record
            const isManager = ['admin', 'manager', 'supervisor'].includes(req.user.role)
            const initialStatus = isManager ? 'completed' : 'pending'

            // Create refund record
            const refund = await Refund.create({
                refund_number: refundNumber,
                order_id: order.id,
                refund_type: 'FULL_REFUND',
                refund_reason,
                refund_category,
                original_order_total: order.total,
                refund_amount: order.total,
                refund_tax: order.tax,
                original_shift_id: order.shift_id,
                refund_shift_id: currentShift?.id,
                branch_id: order.branch_id,
                processed_by: req.user.userId,
                original_cashier_id: order.user_id,
                status: initialStatus,
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('User-Agent'),
                order_snapshot: orderSnapshot
            }, { transaction })

            // Create refund items for each order item
            const refundItems = []
            for (const item of order.items) {
                const originalQuantity = parseFloat(item.quantity || 0)
                const unitPriceRaw = parseFloat(item.unit_price)
                const totalPriceRaw = parseFloat(item.total_price)

                const resolvedUnitPrice = Number.isFinite(unitPriceRaw)
                    ? unitPriceRaw
                    : (Number.isFinite(totalPriceRaw) && originalQuantity > 0
                        ? (totalPriceRaw / originalQuantity)
                        : 0)

                const resolvedRefundAmount = Number.isFinite(totalPriceRaw)
                    ? totalPriceRaw
                    : (resolvedUnitPrice * originalQuantity)

                const refundItem = await RefundItem.create({
                    refund_id: refund.id,
                    order_item_id: item.id,
                    menu_id: item.menu_id,
                    original_quantity: originalQuantity,
                    refund_quantity: originalQuantity,
                    unit_price: resolvedUnitPrice,
                    refund_amount: resolvedRefundAmount
                }, { transaction })
                refundItems.push(refundItem)
            }

            // Only execute financial/stock movements if approved immediately
            if (initialStatus === 'completed') {
                // Restore stock
                await restoreStock(refundItems, req.user.userId, order.id, transaction)

                // Update refund stock status
                await Refund.update(
                    { stock_restored: true },
                    { where: { id: refund.id }, transaction }
                )

                // Update order payment status (do NOT change other fields)
                await Order.update(
                    { payment_status: 'refunded' },
                    { where: { id: order.id }, transaction }
                )
            }

            // Create audit log
            await logRefundAction(initialStatus === 'pending' ? 'request' : 'created', refund, req.user, req, transaction)

            // Keep refund + GL posting in one atomic transaction
            if (initialStatus === 'completed') {
                await AccountingHooks.onRefundApproved(refund, order, { transaction })
            }

            await transaction.commit()

            // Fetch complete refund for response
            const completeRefund = await Refund.findByPk(refund.id, {
                include: [
                    { model: RefundItem, as: 'items', include: [Menu] },
                    { model: User, as: 'processor', attributes: ['id', 'name_ar'] },
                    { model: Order }
                ]
            })

            res.status(201).json({
                success: true,
                message: initialStatus === 'pending' ? 'تم تقديم طلب الاسترداد للموافقة' : 'تم الاسترداد بنجاح',
                data: completeRefund
            })

        } catch (error) {
            await transaction.rollback()
            console.error('Full refund error:', error)
            res.status(500).json({ message: 'حدث خطأ في عملية الاسترداد' })
        }
    }
)

/**
 * POST /api/refunds/partial
 * Process a partial refund (specific items)
 */
router.post('/partial',
    authenticate,
    requireIdempotency({ required: false, endpointName: 'refund_partial' }),
    authorize('admin', 'supervisor', 'manager', 'cashier'),
    [
        body('order_id').isUUID().withMessage('معرف الطلب غير صالح'),
        body('refund_reason').notEmpty().withMessage('سبب الاسترداد مطلوب'),
        body('items').isArray({ min: 1 }).withMessage('يجب تحديد عنصر واحد على الأقل'),
        body('items.*.order_item_id').isUUID().withMessage('معرف عنصر الطلب غير صالح'),
        body('items.*.quantity').isInt({ min: 1 }).withMessage('الكمية يجب أن تكون عدد صحيح موجب')
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                await transaction.rollback()
                return res.status(400).json({ errors: errors.array() })
            }

            const { order_id, refund_reason, refund_category = 'customer_request', items } = req.body

            // Get order
            const order = await Order.findByPk(order_id, {
                include: [{ model: OrderItem, as: 'items', include: [Menu] }]
            })

            // Validate
            const validation = await validateOrderForRefund(order, 'PARTIAL_REFUND')
            if (!validation.valid) {
                await transaction.rollback()
                return res.status(400).json({ message: validation.errors.join(', ') })
            }

            // Check: Cashier cannot refund their own orders
            if (order.user_id === req.user.userId && req.user.role !== 'admin') {
                await transaction.rollback()
                return res.status(403).json({ message: 'لا يمكنك استرداد طلباتك الخاصة' })
            }

            // Calculate refund amount and validate quantities
            let totalRefundAmount = 0
            let totalRefundTax = 0
            const refundItemsData = []

            for (const itemRequest of items) {
                const orderItem = order.items.find(i => i.id === itemRequest.order_item_id)
                if (!orderItem) {
                    await transaction.rollback()
                    return res.status(400).json({ message: `عنصر غير موجود في الطلب: ${itemRequest.order_item_id}` })
                }

                // Check if quantity is valid
                // Get already refunded quantity for this item
                const alreadyRefunded = await RefundItem.sum('refund_quantity', {
                    where: { order_item_id: orderItem.id },
                    include: [{ model: Refund, where: { status: 'completed' } }]
                }) || 0

                const availableQty = orderItem.quantity - alreadyRefunded
                if (itemRequest.quantity > availableQty) {
                    await transaction.rollback()
                    return res.status(400).json({
                        message: `الكمية المطلوبة (${itemRequest.quantity}) أكبر من المتاح (${availableQty}) للمنتج ${orderItem.Menu?.name_ar}`
                    })
                }

                const unitPrice = parseFloat(orderItem.unit_price || 0)
                const itemRefundAmount = unitPrice * itemRequest.quantity
                totalRefundAmount += itemRefundAmount

                refundItemsData.push({
                    order_item_id: orderItem.id,
                    menu_id: orderItem.menu_id,
                    original_quantity: orderItem.quantity,
                    refund_quantity: itemRequest.quantity,
                    unit_price: unitPrice,
                    refund_amount: itemRefundAmount,
                    item_reason: itemRequest.reason || null
                })
            }

            // Calculate proportional tax
            const taxRate = order.tax / order.subtotal
            totalRefundTax = totalRefundAmount * taxRate

            // Get current shift
            const currentShift = await Shift.findOne({
                where: { user_id: req.user.userId, status: 'open' }
            })

            // Generate refund number
            const refundNumber = await generateRefundNumber()

            // Create refund record
            const refund = await Refund.create({
                refund_number: refundNumber,
                order_id: order.id,
                refund_type: 'PARTIAL_REFUND',
                refund_reason,
                refund_category,
                original_order_total: order.total,
                refund_amount: totalRefundAmount + totalRefundTax,
                refund_tax: totalRefundTax,
                original_shift_id: order.shift_id,
                refund_shift_id: currentShift?.id,
                branch_id: order.branch_id,
                processed_by: req.user.userId,
                original_cashier_id: order.user_id,
                status: 'completed',
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('User-Agent'),
                order_snapshot: {
                    order_number: order.order_number,
                    total: order.total,
                    items: order.items.map(i => ({
                        id: i.id,
                        name: i.Menu?.name_ar,
                        qty: i.quantity,
                        unit_price: i.unit_price
                    }))
                }
            }, { transaction })

            // Create refund items
            const refundItems = []
            for (const itemData of refundItemsData) {
                const refundItem = await RefundItem.create({
                    refund_id: refund.id,
                    ...itemData
                }, { transaction })
                refundItems.push(refundItem)
            }

            // Restore stock
            await restoreStock(refundItems, req.user.userId, order.id, transaction)

            // Update refund stock status
            await Refund.update(
                { stock_restored: true },
                { where: { id: refund.id }, transaction }
            )

            // Create audit log
            await logRefundAction('partial_created', refund, req.user, req, transaction)

            // Keep partial refund + GL posting in one atomic transaction
            await AccountingHooks.onRefundApproved(refund, order, { transaction })

            await transaction.commit()

            // Fetch complete refund
            const completeRefund = await Refund.findByPk(refund.id, {
                include: [
                    { model: RefundItem, as: 'items', include: [Menu] },
                    { model: User, as: 'processor', attributes: ['id', 'name_ar'] }
                ]
            })

            res.status(201).json({
                success: true,
                message: 'تم الاسترداد الجزئي بنجاح',
                data: completeRefund
            })

        } catch (error) {
            await transaction.rollback()
            console.error('Partial refund error:', error)
            res.status(500).json({ message: 'حدث خطأ في عملية الاسترداد الجزئي' })
        }
    }
)

/**
 * POST /api/refunds/void
 * Void an order before kitchen starts
 */
router.post('/void',
    authenticate,
    authorize('admin', 'supervisor', 'manager', 'cashier'),
    [
        body('order_id').isUUID().withMessage('معرف الطلب غير صالح'),
        body('refund_reason').optional().isString().withMessage('سبب الإلغاء غير صالح')
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                await transaction.rollback()
                return res.status(400).json({ errors: errors.array() })
            }

            const { order_id, refund_reason } = req.body
            const workflowSettings = loadSettings()?.workflow || {}
            const requireManagerForVoid = workflowSettings.requireManagerForVoid !== false
            const allowCancelWithoutReason = workflowSettings.allowCancelWithoutReason === true
            const normalizedReason = String(refund_reason || '').trim()

            if (requireManagerForVoid && !['admin', 'manager'].includes(req.user?.role)) {
                await transaction.rollback()
                return res.status(403).json({
                    message: 'إلغاء الطلب (VOID) يتطلب صلاحية مدير حسب قواعد العمل',
                    code: 'VOID_MANAGER_REQUIRED'
                })
            }

            if (!allowCancelWithoutReason && !normalizedReason) {
                await transaction.rollback()
                return res.status(400).json({
                    message: 'سبب الإلغاء مطلوب حسب قواعد العمل الحالية',
                    code: 'VOID_REASON_REQUIRED'
                })
            }

            // Get order
            const order = await Order.findByPk(order_id, {
                include: [{ model: OrderItem, as: 'items', include: [Menu] }]
            })

            // Validate for VOID
            const validation = await validateOrderForRefund(order, 'VOID')
            if (!validation.valid) {
                await transaction.rollback()
                return res.status(400).json({ message: validation.errors.join(', ') })
            }

            // Get current shift
            const currentShift = await Shift.findOne({
                where: { user_id: req.user.userId, status: 'open' }
            })

            // Generate refund number
            const refundNumber = await generateRefundNumber()

            const effectiveReason = normalizedReason || 'إلغاء بدون سبب'

            // Create refund (VOID type)
            const refund = await Refund.create({
                refund_number: refundNumber,
                order_id: order.id,
                refund_type: 'VOID',
                refund_reason: effectiveReason,
                refund_category: 'customer_request',
                original_order_total: order.total,
                refund_amount: order.total,
                refund_tax: order.tax,
                original_shift_id: order.shift_id,
                refund_shift_id: currentShift?.id,
                branch_id: order.branch_id,
                processed_by: req.user.userId,
                original_cashier_id: order.user_id,
                status: 'completed',
                stock_restored: true, // No stock was ever consumed
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('User-Agent'),
                order_snapshot: {
                    order_number: order.order_number,
                    status: order.status,
                    total: order.total
                }
            }, { transaction })

            // Update order status to cancelled
            await Order.update(
                { status: 'cancelled', payment_status: 'refunded' },
                { where: { id: order.id }, transaction }
            )

            // Create audit log
            await logRefundAction('void_created', refund, req.user, req, transaction)

            await transaction.commit()

            res.status(201).json({
                success: true,
                message: 'تم إلغاء الطلب بنجاح',
                data: refund
            })

        } catch (error) {
            await transaction.rollback()
            console.error('Void order error:', error)
            res.status(500).json({ message: 'حدث خطأ في إلغاء الطلب' })
        }
    }
)

/**
 * GET /api/refunds/:orderId
 * Get refund history for an order
 */
router.get('/:orderId',
    authenticate,
    [
        param('orderId').isUUID().withMessage('معرف الطلب غير صالح')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() })
            }

            const refunds = await Refund.findAll({
                where: { order_id: req.params.orderId },
                include: [
                    { model: RefundItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar', 'name_en'] }] },
                    { model: User, as: 'processor', attributes: ['id', 'name_ar', 'name_en'] },
                    { model: User, as: 'originalCashier', attributes: ['id', 'name_ar', 'name_en'] }
                ],
                order: [['created_at', 'DESC']]
            })

            res.json({ data: refunds })

        } catch (error) {
            console.error('Get refunds error:', error)
            res.status(500).json({ message: 'خطأ في جلب بيانات المرتجعات' })
        }
    }
)

/**
 * GET /api/refunds
 * List all refunds with filters (Admin only)
 */
router.get('/',
    authenticate,
    authorize('admin', 'supervisor', 'manager'),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                refund_type,
                cashier_id,
                processor_id,
                branch_id,
                from_date,
                to_date,
                status
            } = req.query

            const where = {}

            if (refund_type) where.refund_type = refund_type
            if (cashier_id) where.original_cashier_id = cashier_id
            if (processor_id) where.processed_by = processor_id
            if (branch_id) where.branch_id = branch_id
            if (status) where.status = status

            if (from_date || to_date) {
                where.created_at = {}
                if (from_date) where.created_at[Op.gte] = new Date(from_date)
                if (to_date) where.created_at[Op.lte] = new Date(to_date + 'T23:59:59')
            }

            const { count, rows } = await Refund.findAndCountAll({
                where,
                include: [
                    { model: Order, attributes: ['id', 'order_number', 'order_type', 'total'] },
                    { model: User, as: 'processor', attributes: ['id', 'name_ar'] },
                    { model: User, as: 'originalCashier', attributes: ['id', 'name_ar'] },
                    { model: RefundItem, as: 'items' }
                ],
                order: [['created_at', 'DESC']],
                limit: parseInt(limit),
                offset: (parseInt(page) - 1) * parseInt(limit)
            })

            res.json({
                data: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(count / parseInt(limit))
                }
            })

        } catch (error) {
            console.error('List refunds error:', error)
            res.status(500).json({ message: 'خطأ في جلب قائمة المرتجعات' })
        }
    }
)

/**
 * GET /api/refunds/summary/daily
 * Get daily refund summary for reports
 */
router.get('/summary/daily',
    authenticate,
    authorize('admin', 'supervisor', 'manager'),
    async (req, res) => {
        try {
            const { date, start_date, end_date, branch_id } = req.query

            let where = { status: 'completed' }

            if (start_date && end_date) {
                // Custom range
                where.created_at = {
                    [Op.between]: [
                        new Date(start_date),
                        new Date(new Date(end_date).setHours(23, 59, 59, 999))
                    ]
                }
            } else {
                // Default to single day (provided date or today)
                const targetDate = date ? new Date(date) : new Date()
                const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0))
                const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999))
                where.created_at = { [Op.between]: [startOfDay, endOfDay] }
            }
            if (branch_id) where.branch_id = branch_id

            const refunds = await Refund.findAll({ where })

            const summary = {
                date: startOfDay.toISOString().split('T')[0],
                total_refunds: refunds.length,
                total_amount: refunds.reduce((sum, r) => sum + parseFloat(r.refund_amount), 0),
                by_type: {
                    FULL_REFUND: refunds.filter(r => r.refund_type === 'FULL_REFUND').length,
                    PARTIAL_REFUND: refunds.filter(r => r.refund_type === 'PARTIAL_REFUND').length,
                    VOID: refunds.filter(r => r.refund_type === 'VOID').length
                },
                by_category: {}
            }

            // Group by category
            refunds.forEach(r => {
                if (!summary.by_category[r.refund_category]) {
                    summary.by_category[r.refund_category] = { count: 0, amount: 0 }
                }
                summary.by_category[r.refund_category].count++
                summary.by_category[r.refund_category].amount += parseFloat(r.refund_amount)
            })

            res.json({ data: summary })

        } catch (error) {
            console.error('Refund summary error:', error)
            res.status(500).json({ message: 'خطأ في حساب ملخص المرتجعات' })
        }
    }
)


/**
 * POST /api/refunds/:id/approve
 * Approve a pending refund
 */
router.post('/:id/approve',
    authenticate,
    authorize('admin', 'manager', 'supervisor'),
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const refund = await Refund.findByPk(req.params.id, {
                include: [{ model: RefundItem, as: 'items', include: [Menu] }],
                transaction
            })

            if (!refund) {
                await transaction.rollback()
                return res.status(404).json({ message: 'طلب الاسترداد غير موجود' })
            }

            if (refund.status !== 'pending') {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن الموافقة على هذا الطلب (غير معلق)' })
            }

            // Resolve original order first
            const order = await Order.findByPk(refund.order_id, { transaction })
            if (!order) {
                await transaction.rollback()
                return res.status(404).json({ message: 'الطلب الأصلي غير موجود' })
            }

            // Restore stock (pass order.id to preserve cost traceability)
            await restoreStock(refund.items, req.user.userId, order.id, transaction)

            // Update status
            await refund.update({
                status: 'completed',
                processed_by: req.user.userId,
                stock_restored: true
            }, { transaction })

            // Update Order Payment Status
            await order.update({ payment_status: 'refunded' }, { transaction })

            // Audit
            await logRefundAction('approved', refund, req.user, req, transaction)

            // Keep approve flow + GL posting in one atomic transaction
            await AccountingHooks.onRefundApproved(refund, order, { transaction })

            await transaction.commit()
            res.json({ message: 'تمت الموافقة على الاسترداد بنجاح', data: refund })

        } catch (error) {
            await transaction.rollback()
            console.error('Approve refund error:', error)
            res.status(500).json({ message: 'خطأ في الموافقة على الطلب' })
        }
    }
)

/**
 * POST /api/refunds/:id/reject
 * Reject a pending refund
 */
router.post('/:id/reject',
    authenticate,
    authorize('admin', 'manager', 'supervisor'),
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const refund = await Refund.findByPk(req.params.id)

            if (!refund) {
                await transaction.rollback()
                return res.status(404).json({ message: 'طلب الاسترداد غير موجود' })
            }

            if (refund.status !== 'pending') {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن رفض هذا الطلب (غير معلق)' })
            }

            await refund.update({
                status: 'rejected'
            }, { transaction })

            // Audit
            await logRefundAction('rejected', refund, req.user, req, transaction)

            await transaction.commit()

            res.json({ message: 'تم رفض طلب الاسترداد' })

        } catch (error) {
            await transaction.rollback()
            console.error('Reject refund error:', error)
            res.status(500).json({ message: 'خطأ في رفض الطلب' })
        }
    }
)

module.exports = router
