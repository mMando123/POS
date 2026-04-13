/**
 * Delivery Routes - Complete Delivery Management API
 * Handles: personnel CRUD, order assignment, status tracking, reports
 */
const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')
const OrderFinalizationService = require('../services/orderFinalizationService')

const getModels = () => require('../models')
const DELIVERY_ORDER_TYPES = ['delivery', 'online']
const DELIVERY_OPERATOR_ROLES = ['admin', 'manager', 'supervisor', 'cashier']
const DELIVERY_ADMIN_ROLES = ['admin', 'manager', 'supervisor']
const ACTIVE_DELIVERY_STATUSES = ['assigned', 'picked_up', 'in_transit']
const RETRYABLE_DELIVERY_STATUSES = ['pending', 'failed']
const DELIVERY_PERSONNEL_BASE_ATTRIBUTES = [
    'id',
    'name_ar',
    'name_en',
    'phone',
    'vehicle_type',
    'vehicle_number',
    'branch_id',
    'status',
    'is_active',
    'notes',
    'created_at',
    'updated_at'
]

let deliveryPersonnelAttributesCache = null

const getDeliveryPersonnelAttributes = async () => {
    if (deliveryPersonnelAttributesCache) return deliveryPersonnelAttributesCache

    try {
        const { sequelize } = getModels()
        const table = await sequelize.getQueryInterface().describeTable('delivery_personnel')

        deliveryPersonnelAttributesCache = table?.employee_id
            ? [...DELIVERY_PERSONNEL_BASE_ATTRIBUTES, 'employee_id']
            : [...DELIVERY_PERSONNEL_BASE_ATTRIBUTES]
    } catch (error) {
        // Keep delivery board operational even if schema compatibility was skipped.
        console.warn('Delivery personnel schema introspection failed, falling back to base attributes:', error.message)
        deliveryPersonnelAttributesCache = [...DELIVERY_PERSONNEL_BASE_ATTRIBUTES]
    }

    return deliveryPersonnelAttributesCache
}

const resolveScopedBranchId = (req, requestedBranchId) => {
    const requested = requestedBranchId ? String(requestedBranchId) : null
    const userBranch = req.user?.branchId ? String(req.user.branchId) : null
    const isAdmin = req.user?.role === 'admin'

    if (isAdmin) return requested || null
    if (requested && userBranch && requested !== userBranch) {
        const error = new Error('FORBIDDEN_BRANCH_SCOPE')
        throw error
    }

    return userBranch || requested || null
}

const canAccessBranch = (req, branchId) => {
    if (req.user?.role === 'admin') return true
    if (!req.user?.branchId) return true
    return String(req.user.branchId) === String(branchId || '')
}

const isAwaitingDeliveryAssignment = (order) => (
    order?.status === 'handed_to_cashier' &&
    (!order?.delivery_status || RETRYABLE_DELIVERY_STATUSES.includes(order.delivery_status))
)

const releaseRiderIfIdle = async (deliveryPersonnelId) => {
    if (!deliveryPersonnelId) return

    const { Order, DeliveryPersonnel } = getModels()
    const activeOrders = await Order.count({
        where: {
            delivery_personnel_id: deliveryPersonnelId,
            delivery_status: { [Op.in]: ACTIVE_DELIVERY_STATUSES }
        }
    })

    if (activeOrders === 0) {
        await DeliveryPersonnel.update(
            { status: 'available' },
            { where: { id: deliveryPersonnelId } }
        )
    }
}

const emitOrderLifecycleUpdate = (req, order) => {
    const io = req.app.get('io')
    if (!io || !order?.branch_id) return

    const payload = {
        orderId: order.id,
        status: order.status,
        delivery_status: order.delivery_status,
        order
    }

    io.to(`branch:${order.branch_id}`).emit('order:updated', payload)
    io.to(`order:${order.id}`).emit('order:updated', payload)

    if (order.status === 'completed') {
        io.to(`branch:${order.branch_id}`).emit('order:completed', { order })
        io.to('role:cashier').emit('order:removed', { orderId: order.id })
        io.to('cashier').emit('order:removed', { orderId: order.id })
    }
}

const mapDeliveryWorkflowError = (error) => {
    const errorMessage = String(error?.message || '')

    if (errorMessage.startsWith('ORDER_NOT_FOUND')) {
        return { status: 404, message: 'الطلب غير موجود' }
    }

    if (errorMessage.startsWith('ORDER_ALREADY_FINALIZED')) {
        return { status: 400, message: 'الطلب مكتمل أو ملغي بالفعل' }
    }

    if (errorMessage.startsWith('INVALID_WAREHOUSE_FOR_BRANCH')) {
        return { status: 400, message: 'المستودع المحدد غير صالح لهذا الفرع' }
    }

    if (errorMessage.startsWith('NO_DEFAULT_WAREHOUSE_FOR_BRANCH')) {
        return { status: 500, message: 'لا يوجد مستودع افتراضي لهذا الفرع' }
    }

    if (errorMessage.startsWith('STOCK_DEDUCTION_FAILED')) {
        return {
            status: 400,
            message: `فشل خصم المخزون: ${errorMessage.split(': ').slice(1).join(': ')}`
        }
    }

    if (errorMessage.startsWith('PAYMENT_BREAKDOWN_') || errorMessage.startsWith('PAYMENT_')) {
        return { status: 400, message: 'بيانات الدفع غير مكتملة لإغلاق الطلب' }
    }

    return {
        status: 500,
        message: error?.message || 'خطأ في معالجة مسار التوصيل'
    }
}

// ─────────────────────────────────────────────────────
// PERSONNEL MANAGEMENT
// ─────────────────────────────────────────────────────

/**
 * GET /api/delivery/personnel
 * List all delivery personnel (optionally filtered by branch/status)
 */
router.get('/personnel', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { DeliveryPersonnel } = getModels()
        const { status, branch_id, active } = req.query
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()

        const where = {}
        if (status) where.status = status
        const scopedBranchId = resolveScopedBranchId(req, branch_id)
        if (scopedBranchId) where.branch_id = scopedBranchId
        if (active !== undefined) where.is_active = active === 'true'

        const personnel = await DeliveryPersonnel.findAll({
            where,
            attributes: deliveryPersonnelAttributes,
            order: [['name_ar', 'ASC']]
        })

        res.json({ data: personnel })
    } catch (error) {
        if (error.message === 'FORBIDDEN_BRANCH_SCOPE') {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
        console.error('Get delivery personnel error:', error)
        res.status(500).json({ message: error.message || 'خطأ في جلب بيانات الديليفري' })
    }
})

/**
 * POST /api/delivery/personnel
 * Create a new delivery person
 */
router.post('/personnel',
    authenticate,
    authorize(...DELIVERY_ADMIN_ROLES),
    [
        body('name_ar').notEmpty().withMessage('الاسم بالعربي مطلوب').trim(),
        body('phone').notEmpty().withMessage('رقم الهاتف مطلوب').trim(),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

        try {
            const { DeliveryPersonnel } = getModels()
            const { name_ar, name_en, phone, vehicle_type, vehicle_number, notes } = req.body

            const person = await DeliveryPersonnel.create({
                name_ar,
                name_en,
                phone,
                vehicle_type: vehicle_type || 'motorcycle',
                vehicle_number,
                branch_id: req.user.branchId,
                notes,
                status: 'available',
                is_active: true
            })

            res.status(201).json({ message: 'تم إضافة موظف الديليفري بنجاح', data: person })
        } catch (error) {
            console.error('Create delivery personnel error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء موظف الديليفري' })
        }
    }
)

/**
 * PUT /api/delivery/personnel/:id
 * Update delivery person info
 */
router.put('/personnel/:id', authenticate, authorize(...DELIVERY_ADMIN_ROLES), async (req, res) => {
    try {
        const { DeliveryPersonnel } = getModels()
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()
        const person = await DeliveryPersonnel.findByPk(req.params.id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!person) return res.status(404).json({ message: 'موظف الديليفري غير موجود' })

                if (!canAccessBranch(req, person.branch_id)) {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
const { name_ar, name_en, phone, vehicle_type, vehicle_number, notes, is_active } = req.body
        await person.update({ name_ar, name_en, phone, vehicle_type, vehicle_number, notes, is_active })

        res.json({ message: 'تم تحديث بيانات الديليفري', data: person })
    } catch (error) {
        console.error('Update delivery personnel error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تحديث بيانات الديليفري' })
    }
})

/**
 * PATCH /api/delivery/personnel/:id/status
 * Change availability status (available | busy | offline)
 */
router.patch('/personnel/:id/status', authenticate, authorize(...DELIVERY_ADMIN_ROLES), async (req, res) => {
    try {
        const { DeliveryPersonnel } = getModels()
        const { status } = req.body
        const allowed = ['available', 'busy', 'offline']
        if (!allowed.includes(status)) return res.status(400).json({ message: 'حالة غير صحيحة' })

        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()
        const person = await DeliveryPersonnel.findByPk(req.params.id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!person) return res.status(404).json({ message: 'موظف الديليفري غير موجود' })

                if (!canAccessBranch(req, person.branch_id)) {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
await person.update({ status })
        res.json({ message: `تم تغيير حالة ${person.name_ar} إلى ${status}`, data: person })
    } catch (error) {
        const mapped = mapDeliveryWorkflowError(error)
        res.status(mapped.status).json({ message: mapped.message })
    }
})

/**
 * DELETE /api/delivery/personnel/:id
 * Soft-delete (deactivate)
 */
router.delete('/personnel/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { DeliveryPersonnel } = getModels()
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()
        const person = await DeliveryPersonnel.findByPk(req.params.id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!person) return res.status(404).json({ message: 'موظف الديليفري غير موجود' })

                if (!canAccessBranch(req, person.branch_id)) {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
await person.update({ is_active: false, status: 'offline' })
        res.json({ message: 'تم تعطيل موظف الديليفري' })
    } catch (error) {
        const mapped = mapDeliveryWorkflowError(error)
        return res.status(mapped.status).json({ message: mapped.message })
    }
})

// ─────────────────────────────────────────────────────
// ORDER DELIVERY MANAGEMENT
// ─────────────────────────────────────────────────────

/**
 * GET /api/delivery/orders
 * Get active delivery orders with their rider info
 */
router.get('/orders', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order, OrderItem, DeliveryPersonnel, Customer } = getModels()
        const { delivery_status, branch_id } = req.query
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()

        const where = { order_type: { [Op.in]: DELIVERY_ORDER_TYPES } }
        if (delivery_status) where.delivery_status = delivery_status
        const scopedBranchId = resolveScopedBranchId(req, branch_id)
        if (scopedBranchId) where.branch_id = scopedBranchId

        if (!req.query.include_completed) {
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            where[Op.or] = [
                {
                    status: 'handed_to_cashier',
                    delivery_status: { [Op.in]: [...RETRYABLE_DELIVERY_STATUSES, ...ACTIVE_DELIVERY_STATUSES] }
                },
                { status: 'handed_to_cashier', delivery_status: null },
                { delivery_status: 'delivered', delivered_at: { [Op.gte]: todayStart } }
            ]
        }

        const orders = await Order.findAll({
            where,
            include: [
                { model: OrderItem, as: 'items' },
                {
                    model: DeliveryPersonnel,
                    as: 'deliveryRider',
                    required: false,
                    attributes: deliveryPersonnelAttributes
                },
                { model: Customer, attributes: ['id', 'name', 'phone'], required: false }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(req.query.limit) || 100
        })

        res.json({ data: orders })
    } catch (error) {
        if (error.message === 'FORBIDDEN_BRANCH_SCOPE') {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
        console.error('Get delivery orders error:', error)
        res.status(500).json({ message: error.message || 'Error loading delivery orders' })
    }
})

/**
 * POST /api/delivery/orders/:id/assign
 * Assign a delivery person to an order
 */
router.post('/orders/:id/assign', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order, DeliveryPersonnel } = getModels()
        const { delivery_personnel_id } = req.body
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()

        if (!delivery_personnel_id) {
            return res.status(400).json({ message: 'Delivery rider is required' })
        }

        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'Order not found' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!DELIVERY_ORDER_TYPES.includes(order.order_type)) {
            return res.status(400).json({ message: 'This order is not a supported delivery channel' })
        }
        if (['completed', 'cancelled'].includes(order.status) || order.delivery_status === 'delivered') {
            return res.status(400).json({ message: 'This order is already closed' })
        }
        if (order.status !== 'handed_to_cashier') {
            return res.status(400).json({ message: 'Order must be handed to cashier before assigning delivery' })
        }
        if (!isAwaitingDeliveryAssignment(order)) {
            return res.status(400).json({ message: 'This order cannot be assigned right now' })
        }

        const rider = await DeliveryPersonnel.findByPk(delivery_personnel_id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!rider) return res.status(404).json({ message: 'Delivery rider not found' })
        if (!rider.is_active) return res.status(400).json({ message: 'Delivery rider is inactive' })
        if (String(rider.branch_id || '') != String(order.branch_id || '')) {
            return res.status(400).json({ message: 'Delivery rider must belong to the same branch as the order' })
        }

        await order.update({
            delivery_personnel_id,
            delivery_status: 'assigned',
            delivery_assigned_at: new Date(),
            picked_up_at: null,
            delivered_at: null
        })

        await rider.update({ status: 'busy' })
        emitOrderLifecycleUpdate(req, order)

        res.json({ message: `Assigned ${rider.name_ar} to order #${order.order_number}`, data: order })
    } catch (error) {
        console.error('Assign delivery error:', error)
        const mapped = mapDeliveryWorkflowError(error)
        res.status(mapped.status).json({ message: mapped.message })
    }
})

/**
 * POST /api/delivery/orders/:id/pickup
 * Mark order as picked up by delivery person
 */
router.post('/orders/:id/pickup', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order } = getModels()
        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'Order not found' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!DELIVERY_ORDER_TYPES.includes(order.order_type)) {
            return res.status(400).json({ message: 'This order is not a supported delivery channel' })
        }
        if (['completed', 'cancelled'].includes(order.status) || order.delivery_status === 'delivered') {
            return res.status(400).json({ message: 'This order is already closed' })
        }
        if (order.status !== 'handed_to_cashier') {
            return res.status(400).json({ message: 'Order must be handed to cashier before pickup' })
        }
        if (!order.delivery_personnel_id) {
            return res.status(400).json({ message: 'No delivery rider has been assigned yet' })
        }
        if (order.delivery_status !== 'assigned') {
            return res.status(400).json({ message: 'Order must be assigned before pickup can be recorded' })
        }

        await order.update({
            delivery_status: 'picked_up',
            picked_up_at: new Date()
        })

        emitOrderLifecycleUpdate(req, order)
        res.json({ message: `Order #${order.order_number} picked up from cashier`, data: order })
    } catch (error) {
        const mapped = mapDeliveryWorkflowError(error)
        res.status(mapped.status).json({ message: mapped.message })
    }
})

/**
 * POST /api/delivery/orders/:id/complete
 * Mark order as delivered successfully and finalize it atomically
 */
router.post('/orders/:id/complete', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order } = getModels()
        const { payment_method, payment_breakdown, warehouse_id } = req.body || {}
        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'Order not found' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!DELIVERY_ORDER_TYPES.includes(order.order_type)) {
            return res.status(400).json({ message: 'This order is not a supported delivery channel' })
        }
        if (order.status === 'completed' && order.delivery_status === 'delivered') {
            return res.json({ message: `Order #${order.order_number} is already delivered and closed`, data: order })
        }
        if (order.status !== 'handed_to_cashier') {
            return res.status(400).json({ message: 'Order must be handed to cashier before delivery can be completed' })
        }
        if (!order.delivery_personnel_id) {
            return res.status(400).json({ message: 'Cannot complete delivery before assigning a rider' })
        }
        if (order.delivery_status !== 'picked_up') {
            return res.status(400).json({ message: 'Rider must pick up the order before delivery can be completed' })
        }

        const finalizedOrder = await OrderFinalizationService.finalizeOrder(order.id, {
            user: req.user,
            paymentMethod: payment_method || order.payment_method || 'cash',
            paymentBreakdown: payment_breakdown,
            warehouseId: warehouse_id || null
        })

        await finalizedOrder.update({
            delivery_status: 'delivered',
            delivered_at: finalizedOrder.delivered_at || new Date()
        })

        await releaseRiderIfIdle(finalizedOrder.delivery_personnel_id)
        emitOrderLifecycleUpdate(req, finalizedOrder)

        res.json({
            message: `Order #${finalizedOrder.order_number} delivered and closed successfully`,
            data: finalizedOrder
        })
    } catch (error) {
        const mapped = mapDeliveryWorkflowError(error)
        res.status(mapped.status).json({ message: mapped.message })
    }
})

/**
 * POST /api/delivery/orders/:id/fail
 * Mark delivery as failed and move the order back for reassignment
 */
router.post('/orders/:id/fail', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order } = getModels()
        const { reason } = req.body
        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'Order not found' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!DELIVERY_ORDER_TYPES.includes(order.order_type)) {
            return res.status(400).json({ message: 'This order is not a supported delivery channel' })
        }
        if (['completed', 'cancelled'].includes(order.status) || order.delivery_status === 'delivered') {
            return res.status(400).json({ message: 'Cannot mark a closed order as delivery failed' })
        }
        if (!ACTIVE_DELIVERY_STATUSES.includes(order.delivery_status)) {
            return res.status(400).json({ message: 'Cannot mark delivery failure before the rider starts the trip' })
        }

        const updateFields = {
            delivery_status: 'failed',
            status: 'handed_to_cashier',
            delivery_assigned_at: null,
            picked_up_at: null,
            delivered_at: null
        }
        if (reason) updateFields.notes = ((order.notes || '') + ` | Delivery failure: ${reason}`).trim()
        await order.update(updateFields)

        await releaseRiderIfIdle(order.delivery_personnel_id)
        emitOrderLifecycleUpdate(req, order)

        res.json({ message: `Delivery failure recorded for order #${order.order_number}`, data: order })
    } catch (error) {
        const mapped = mapDeliveryWorkflowError(error)
        res.status(mapped.status).json({ message: mapped.message })
    }
})

// REPORTS & STATS
// ─────────────────────────────────────────────────────

/**
 * GET /api/delivery/reports
 * Delivery performance by rider + order type breakdown
 */
router.get('/reports', authenticate, authorize(...DELIVERY_ADMIN_ROLES), async (req, res) => {
    try {
        const { Order, DeliveryPersonnel, sequelize } = getModels()
        const { from_date, to_date, branch_id } = req.query
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()

        const where = { order_type: { [Op.in]: DELIVERY_ORDER_TYPES } }
        if (from_date) where.created_at = { [Op.gte]: new Date(from_date) }
        if (to_date) where.created_at = { ...where.created_at, [Op.lte]: new Date(to_date + 'T23:59:59') }
        const scopedBranchId = resolveScopedBranchId(req, branch_id)
        if (scopedBranchId) where.branch_id = scopedBranchId

        // Total orders per rider
        const riderStats = await Order.findAll({
            where,
            attributes: [
                'delivery_personnel_id',
                [sequelize.fn('COUNT', sequelize.col('Order.id')), 'total_orders'],
                [sequelize.fn('SUM', sequelize.col('total')), 'total_revenue'],
                [sequelize.fn('SUM', sequelize.col('delivery_fee')), 'total_fees'],
                [sequelize.fn('SUM', sequelize.literal("CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END")), 'completed'],
                [sequelize.fn('SUM', sequelize.literal("CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END")), 'failed'],
            ],
            group: ['delivery_personnel_id'],
            include: [{
                model: DeliveryPersonnel,
                as: 'deliveryRider',
                required: false,
                attributes: deliveryPersonnelAttributes
            }]
        })

        // Order type breakdown
        const typeBreakdown = await Order.findAll({
            where: { ...(where.branch_id ? { branch_id: where.branch_id } : {}), ...(from_date ? { created_at: where.created_at } : {}) },
            attributes: [
                'order_type',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total')), 'revenue']
            ],
            group: ['order_type']
        })

        res.json({
            data: {
                rider_stats: riderStats,
                type_breakdown: typeBreakdown
            }
        })
    } catch (error) {
        if (error.message === 'FORBIDDEN_BRANCH_SCOPE') {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
        console.error('Delivery report error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تقارير الديليفري' })
    }
})

/**
 * GET /api/delivery/personnel/:id/history
 * Get delivery history for a specific rider
 */
router.get('/personnel/:id/history', authenticate, authorize(...DELIVERY_ADMIN_ROLES), async (req, res) => {
    try {
        const { Order, DeliveryPersonnel } = getModels()
        const { page = 1, limit = 20 } = req.query
        const deliveryPersonnelAttributes = await getDeliveryPersonnelAttributes()

        const rider = await DeliveryPersonnel.findByPk(req.params.id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!rider) return res.status(404).json({ message: 'موظف الديليفري غير موجود' })

                if (!canAccessBranch(req, rider.branch_id)) {
            return res.status(403).json({ message: 'Access to this branch is not allowed' })
        }
const { count, rows } = await Order.findAndCountAll({
            where: { delivery_personnel_id: req.params.id },
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        })

        res.json({
            data: rows,
            pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
            rider
        })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

module.exports = router
