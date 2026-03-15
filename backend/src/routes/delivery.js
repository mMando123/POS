/**
 * Delivery Routes - Complete Delivery Management API
 * Handles: personnel CRUD, order assignment, status tracking, reports
 */
const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')

const getModels = () => require('../models')
const DELIVERY_ORDER_TYPES = ['delivery', 'online']
const DELIVERY_OPERATOR_ROLES = ['admin', 'manager', 'supervisor', 'cashier']
const DELIVERY_ADMIN_ROLES = ['admin', 'manager', 'supervisor']
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
        res.status(500).json({ message: error.message })
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
        res.status(500).json({ message: error.message })
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

        // Include today's delivered orders so they show in the board's "تم التوصيل" column
        if (!req.query.include_completed) {
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            where[Op.or] = [
                { delivery_status: { [Op.ne]: 'delivered' } },
                { delivery_status: null },
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
        res.status(500).json({ message: error.message || 'خطأ في جلب طلبات الديليفري' })
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

        if (!delivery_personnel_id) return res.status(400).json({ message: 'يجب تحديد موظف الديليفري' })

        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!DELIVERY_ORDER_TYPES.includes(order.order_type)) {
            return res.status(400).json({ message: 'هذا الطلب ليس ضمن قناة توصيل مدعومة' })
        }

        const rider = await DeliveryPersonnel.findByPk(delivery_personnel_id, {
            attributes: deliveryPersonnelAttributes
        })
        if (!rider) return res.status(404).json({ message: 'موظف الديليفري غير موجود' })
        if (!rider.is_active) return res.status(400).json({ message: 'موظف الديليفري غير نشط' })
        if (String(rider.branch_id || '') !== String(order.branch_id || '')) {
            return res.status(400).json({ message: '???????? ?????????????????? ???? ???????? ?????? ?????? ??????????' })
        }

        await order.update({
            delivery_personnel_id,
            delivery_status: 'assigned',
            delivery_assigned_at: new Date()
        })

        // Mark rider as busy
        await rider.update({ status: 'busy' })

        res.json({ message: `تم تعيين ${rider.name_ar} للطلب #${order.order_number}`, data: order })
    } catch (error) {
        console.error('Assign delivery error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تعيين الديليفري' })
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
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })
        if (!order.delivery_personnel_id) return res.status(400).json({ message: 'لم يتم تعيين ديليفري بعد' })

        await order.update({
            delivery_status: 'picked_up',
            picked_up_at: new Date()
        })

        res.json({ message: `الطلب #${order.order_number} تم استلامه من الكاشير`, data: order })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

/**
 * POST /api/delivery/orders/:id/complete
 * Mark order as delivered successfully
 */
router.post('/orders/:id/complete', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order, DeliveryPersonnel } = getModels()
        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })

        await order.update({
            delivery_status: 'delivered',
            delivered_at: new Date()
        })

        // Free up the rider if they have no more active orders
        if (order.delivery_personnel_id) {
            const activeOrders = await Order.count({
                where: {
                    delivery_personnel_id: order.delivery_personnel_id,
                    delivery_status: { [Op.in]: ['assigned', 'picked_up', 'in_transit'] }
                }
            })
            if (activeOrders === 0) {
                await DeliveryPersonnel.update(
                    { status: 'available' },
                    { where: { id: order.delivery_personnel_id } }
                )
            }
        }

        res.json({ message: `الطلب #${order.order_number} تم تسليمه بنجاح ✅`, data: order })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

/**
 * POST /api/delivery/orders/:id/fail
 * Mark delivery as failed
 */
router.post('/orders/:id/fail', authenticate, authorize(...DELIVERY_OPERATOR_ROLES), async (req, res) => {
    try {
        const { Order, DeliveryPersonnel } = getModels()
        const { reason } = req.body
        const order = await Order.findByPk(req.params.id)
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' })
        if (!canAccessBranch(req, order.branch_id)) return res.status(403).json({ message: 'Access to this branch is not allowed' })

        // DEF-005 FIX: Reset order to handed_to_cashier so cashier can reassign
        const updateFields = { delivery_status: 'failed', status: 'handed_to_cashier' }
        if (reason) updateFields.notes = ((order.notes || '') + ` | فشل التوصيل: ${reason}`).trim()
        await order.update(updateFields)

        if (order.delivery_personnel_id) {
            await DeliveryPersonnel.update(
                { status: 'available' },
                { where: { id: order.delivery_personnel_id } }
            )
        }

        res.json({ message: `تم تسجيل فشل توصيل الطلب #${order.order_number}`, data: order })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

// ─────────────────────────────────────────────────────
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
