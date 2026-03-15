const express = require('express')
const { body } = require('express-validator')
const { Op } = require('sequelize')

const { validate } = require('../middleware/validate')
const { authenticate, authorize, optionalAuth, requirePermission, requireAnyPermission, PERMISSIONS } = require('../middleware/auth')
const { orderLimiter } = require('../middleware/rateLimiter')
const { requireIdempotency } = require('../middleware/idempotency')
const { validateDiscount } = require('../middleware/discountControl')

const {
    Order,
    OrderItem,
    OrderPayment,
    Customer,
    User,
    Menu,
    DeliveryPersonnel,
    Warehouse,
    Shift,
    StockMovement,
    Coupon,
    Branch,
    sequelize
} = require('../models')

const { createOrderValidator, updateOrderStatusValidator } = require('../validators/orderValidator')
const PricingService = require('../services/pricingService')
const OrderPaymentService = require('../services/orderPaymentService')
const OrderFinalizationService = require('../services/orderFinalizationService')
const AuditService = require('../services/auditService')
const logger = require('../services/logger')
const { loadSettings } = require('./settings')

const router = express.Router()

const round2 = (value) => Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100

const mapPricingError = (error) => {
    const messageMap = {
        COUPON_NOT_FOUND: 'الكوبون غير موجود',
        COUPON_NOT_STARTED: 'الكوبون غير مفعل بعد',
        COUPON_EXPIRED: 'انتهت صلاحية الكوبون',
        COUPON_MIN_ORDER_NOT_MET: 'إجمالي الطلب أقل من الحد الأدنى المطلوب للكوبون',
        COUPON_USAGE_LIMIT_REACHED: 'تم استهلاك الحد الأقصى لاستخدام الكوبون',
        COUPON_DISCOUNT_ZERO: 'الكوبون لا ينطبق على هذا الطلب',
        LOYALTY_CUSTOMER_REQUIRED: 'يجب تحديد العميل لاستخدام نقاط الولاء',
        LOYALTY_POINTS_INSUFFICIENT: 'نقاط الولاء غير كافية',
        ORDER_ITEMS_REQUIRED: 'يجب إضافة صنف واحد على الأقل'
    }

    if (!error?.message) return 'فشل حساب التسعير'
    return messageMap[error.message] || error.message
}

const statusMessages = {
    pending: 'الطلب في انتظار الموافقة',
    approved: 'تم قبول الطلب',
    new: 'طلب جديد',
    confirmed: 'تم تأكيد الطلب',
    preparing: 'جاري التحضير',
    ready: 'جاهز للتسليم',
    handed_to_cashier: 'تم التسليم للكاشير',
    completed: 'تم إكمال الطلب',
    cancelled: 'تم إلغاء الطلب'
}

const validTransitions = {
    pending: ['approved', 'cancelled'],
    approved: ['preparing', 'cancelled'],
    new: ['preparing', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['handed_to_cashier', 'cancelled'],
    handed_to_cashier: ['cancelled'],
    completed: [],
    cancelled: []
}

const hasBranchAccess = (req, branchId) => {
    if (req.user?.role === 'admin') return true
    if (!req.user?.branchId) return true
    return String(req.user.branchId) === String(branchId || '')
}

const buildIncludes = () => ([
    { model: OrderItem, as: 'items' },
    { model: OrderPayment, as: 'payments', required: false },
    { model: Customer, attributes: ['id', 'name', 'phone'], required: false },
    { model: User, attributes: ['id', 'name_ar', 'name_en'], required: false },
    { model: DeliveryPersonnel, as: 'deliveryRider', attributes: ['id', 'name_ar', 'phone', 'status'], required: false }
])

const resolveBranchId = async (req, transaction = null) => {
    if (req.user?.branchId) return req.user.branchId

    const defaultBranch = await Branch.findOne({
        where: { is_active: true },
        order: [['created_at', 'ASC']],
        ...(transaction ? { transaction } : {})
    })

    return defaultBranch?.id || null
}

const normalizeOrderPrefix = (prefix) => {
    const normalized = String(prefix || '').trim().replace(/\s+/g, '').replace(/-+$/g, '')
    return normalized
}

const normalizeOrderStart = (startValue) => {
    const parsed = parseInt(startValue, 10)
    if (!Number.isFinite(parsed) || parsed < 1) return 1
    return parsed
}

const generateOrderNumber = async (settings = null, transaction = null) => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const datePart = `${yyyy}${mm}${dd}`

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const countToday = await Order.count({
        where: { created_at: { [Op.between]: [start, end] } },
        ...(transaction ? { transaction } : {})
    })

    const configuredPrefix = normalizeOrderPrefix(settings?.workflow?.orderNumberPrefix || '')
    const startFrom = normalizeOrderStart(settings?.workflow?.orderNumberStart)
    const sequenceNumber = startFrom + countToday
    const sequenceWidth = Math.max(4, String(startFrom).length)
    const seq = String(sequenceNumber).padStart(sequenceWidth, '0')

    const maxPrefixLength = Math.max(0, 20 - (datePart.length + seq.length + 2))
    const safePrefix = configuredPrefix.slice(0, maxPrefixLength)
    const parts = [safePrefix, datePart, seq].filter(Boolean)
    return parts.join('-')
}

// List orders
router.get(
    '/',
    authenticate,
    requireAnyPermission(PERMISSIONS.ORDERS_VIEW_ALL, PERMISSIONS.ORDERS_VIEW_OWN, PERMISSIONS.ORDERS_PROCESS),
    async (req, res) => {
    try {
        const {
            status,
            order_type,
            limit = 50,
            offset = 0,
            date_from,
            date_to,
            search
        } = req.query

        const where = {}

        if (status) where.status = status
        if (order_type) where.order_type = order_type

        // Branch isolation for non-admin users
        if (req.user?.role !== 'admin' && req.user?.branchId) {
            where.branch_id = req.user.branchId
        }

        if (date_from || date_to) {
            where.created_at = {}
            if (date_from) where.created_at[Op.gte] = new Date(date_from)
            if (date_to) {
                const end = new Date(date_to)
                end.setHours(23, 59, 59, 999)
                where.created_at[Op.lte] = end
            }
        }

        if (search) {
            where[Op.or] = [
                { order_number: { [Op.like]: `%${search}%` } },
                { notes: { [Op.like]: `%${search}%` } }
            ]
        }

        const rows = await Order.findAll({
            where,
            include: buildIncludes(),
            order: [['created_at', 'DESC']],
            limit: Math.min(parseInt(limit, 10) || 50, 200),
            offset: Math.max(parseInt(offset, 10) || 0, 0)
        })

        res.json({ data: rows })
    } catch (error) {
        logger.error('List orders error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
    }
)

// Stock batches by menu item
router.get('/stock-batches/:menuId', optionalAuth, async (req, res) => {
    try {
        const { menuId } = req.params
        const branchId = await resolveBranchId(req)
        const requestedWarehouseId = String(req.query?.warehouse_id || '').trim() || null
        const assignedWarehouseId = req.user?.role === 'cashier'
            ? (String(req.user?.defaultWarehouseId || '').trim() || null)
            : null

        if (!branchId) {
            return res.status(400).json({ message: 'لا يوجد فرع متاح' })
        }

        if (assignedWarehouseId && requestedWarehouseId && requestedWarehouseId !== assignedWarehouseId) {
            return res.status(403).json({ message: 'غير مصرح لك بالوصول لمخزن آخر غير المخزن المعيّن لك' })
        }

        const effectiveWarehouseId = assignedWarehouseId || requestedWarehouseId

        let targetWarehouse = null

        if (effectiveWarehouseId) {
            targetWarehouse = await Warehouse.findOne({
                where: {
                    id: effectiveWarehouseId,
                    branch_id: branchId,
                    status: 'active'
                }
            })
            if (!targetWarehouse) {
                return res.status(400).json({ message: 'المستودع المحدد غير صالح لهذا الفرع' })
            }
        } else {
            const warehouse = await Warehouse.findOne({
                where: { branch_id: branchId, is_default: true, status: 'active' }
            })

            targetWarehouse = warehouse || await Warehouse.findOne({
                where: { branch_id: branchId, status: 'active' },
                order: [['created_at', 'ASC']]
            })
        }

        if (!targetWarehouse) {
            return res.status(404).json({ message: 'لم يتم العثور على مستودع نشط لهذا الفرع' })
        }

        const movements = await StockMovement.findAll({
            where: {
                menu_id: menuId,
                warehouse_id: targetWarehouse.id,
                movement_type: 'IN',
                remaining_quantity: { [Op.gt]: 0 }
            },
            order: [['created_at', 'ASC']],
            limit: 200
        })

        const data = movements.map((m) => ({
            id: m.id,
            batch_number: m.batch_number,
            expiry_date: m.expiry_date,
            remaining_quantity: parseFloat(m.remaining_quantity || 0),
            unit_cost: parseFloat(m.unit_cost || 0)
        }))

        // Keep backward compatibility: some clients expect `data` as array,
        // others still read from `data.batches`.
        res.json({
            data,
            batches: data,
            warehouse_id: targetWarehouse.id
        })
    } catch (error) {
        logger.error('Get stock batches error:', error)
        res.status(500).json({ message: 'فشل تحميل دفعات المخزون' })
    }
})

// KDS active orders
router.get('/kds/active', authenticate, requirePermission(PERMISSIONS.KDS_VIEW), async (req, res) => {
    try {
        const rows = await Order.findAll({
            where: {
                status: { [Op.in]: ['approved', 'new', 'confirmed', 'preparing', 'ready'] }
            },
            include: [{ model: OrderItem, as: 'items' }],
            order: [['created_at', 'ASC']]
        })
        res.json({ data: rows })
    } catch (error) {
        logger.error('Get KDS active orders error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Cashier-ready queue — DEF-001 FIX: branch isolation + full includes
router.get(
    '/cashier/ready',
    authenticate,
    requireAnyPermission(PERMISSIONS.ORDERS_VIEW_ALL, PERMISSIONS.ORDERS_VIEW_OWN, PERMISSIONS.ORDERS_PROCESS),
    async (req, res) => {
    try {
        const where = {
            status: { [Op.in]: ['ready', 'handed_to_cashier'] }
        }

        // Branch isolation for non-admin users
        if (req.user?.role !== 'admin' && req.user?.branchId) {
            where.branch_id = req.user.branchId
        }

        const rows = await Order.findAll({
            where,
            include: [
                { model: OrderItem, as: 'items' },
                { model: OrderPayment, as: 'payments', required: false },
                { model: Customer, attributes: ['id', 'name', 'phone'], required: false },
                { model: DeliveryPersonnel, as: 'deliveryRider', attributes: ['id', 'name_ar', 'phone'], required: false }
            ],
            order: [['created_at', 'ASC']]
        })
        res.json({ data: rows })
    } catch (error) {
        logger.error('Get cashier-ready orders error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
    }
)

// Admin pending online orders
router.get('/admin/pending', authenticate, authorize('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const where = {
            status: 'pending',
            order_type: 'online',
            [Op.or]: [{ payment_method: 'cash' }, { payment_status: 'paid' }]
        }

        if (req.user?.role !== 'admin' && req.user?.branchId) {
            where.branch_id = req.user.branchId
        }

        const rows = await Order.findAll({
            where,
            include: [{ model: OrderItem, as: 'items' }],
            order: [['created_at', 'ASC']]
        })

        res.json({ data: rows })
    } catch (error) {
        logger.error('Get pending online orders error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Public order tracking (supports order id or order number)
router.get('/track/:reference', optionalAuth, async (req, res) => {
    try {
        const reference = String(req.params.reference || '').trim()
        const normalizedReference = reference.replace(/^#/, '')
        if (!reference) {
            return res.status(400).json({ message: 'مرجع الطلب مطلوب' })
        }

        const order = await Order.findOne({
            where: {
                [Op.or]: [
                    { id: reference },
                    { order_number: reference },
                    { order_number: normalizedReference }
                ]
            },
            attributes: [
                'id',
                'order_number',
                'status',
                'order_type',
                'payment_status',
                'total',
                'delivery_status',
                'delivery_personnel_id',
                'delivery_assigned_at',
                'picked_up_at',
                'delivered_at',
                'created_at',
                'updated_at'
            ],
            include: [{
                model: OrderItem,
                as: 'items',
                attributes: ['id', 'menu_id', 'item_name_ar', 'item_name_en', 'quantity', 'unit_price', 'total_price']
            }]
        })

        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        res.json({ data: order })
    } catch (error) {
        logger.error('Track order error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Get order by id
router.get(
    '/:id',
    authenticate,
    requireAnyPermission(PERMISSIONS.ORDERS_VIEW_ALL, PERMISSIONS.ORDERS_VIEW_OWN, PERMISSIONS.ORDERS_PROCESS),
    async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id, { include: buildIncludes() })
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (!hasBranchAccess(req, order.branch_id)) {
            return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
        }

        res.json({ data: order })
    } catch (error) {
        logger.error('Get order by id error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
    }
)

// Create order
router.post('/', orderLimiter, optionalAuth, createOrderValidator, validateDiscount, validate, async (req, res) => {
    const t = await sequelize.transaction()
    try {
        const {
            order_type,
            items,
            customer_phone,
            customer_name,
            customer_address,
            notes,
            payment_method,
            payment_breakdown,
            coupon_code,
            client_reference,
            redeem_points,
            price_list_id,
            table_number,
            delivery_address,
            delivery_fee,
            delivery_personnel_id,
            delivery_status
        } = req.body
        const requestedPaymentMethod = payment_method || 'cash'

        if (order_type !== 'online' && !req.user) {
            await t.rollback()
            return res.status(401).json({
                message: 'يجب تسجيل الدخول لإنشاء طلب من الكاشير',
                code: 'AUTH_REQUIRED'
            })
        }

        if (req.user && !req.user.permissions?.includes(PERMISSIONS.ORDERS_CREATE)) {
            await t.rollback()
            return res.status(403).json({
                message: 'ليس لديك صلاحية إنشاء طلبات جديدة'
            })
        }

        const branch_id = await resolveBranchId(req, t)
        if (!branch_id) {
            await t.rollback()
            return res.status(400).json({ message: 'لا يوجد فرع متاح' })
        }

        const normalizedClientRef = String(client_reference || '').trim() || null
        if (normalizedClientRef) {
            const existingOrder = await Order.findOne({
                where: { branch_id, client_reference: normalizedClientRef },
                include: buildIncludes(),
                transaction: t
            })
            if (existingOrder) {
                await t.rollback()
                return res.status(200).json({
                    duplicate: true,
                    message: 'تم إنشاء طلب سابقًا بنفس مرجع العميل',
                    data: existingOrder
                })
            }
        }

        let customer = null
        let customer_id = null
        if (customer_phone) {
            const [row] = await Customer.findOrCreate({
                where: { phone: customer_phone },
                defaults: {
                    phone: customer_phone,
                    name: customer_name,
                    address: customer_address,
                    loyalty_points: 0
                },
                transaction: t
            })
            customer = row
            customer_id = row.id
        }

        const manualDiscount = round2(req._validatedDiscount?.amount || 0)
        const redeemPoints = Math.max(0, parseInt(redeem_points || 0, 10))

        let pricingDraft
        try {
            pricingDraft = await PricingService.buildOrderDraft({
                branchId: branch_id,
                items,
                manualDiscount,
                couponCode: coupon_code || null,
                customer,
                redeemPoints,
                priceListId: price_list_id || null,
                transaction: t
            })
        } catch (pricingErr) {
            await t.rollback()
            return res.status(400).json({
                message: mapPricingError(pricingErr),
                code: pricingErr.message || 'PRICING_ERROR'
            })
        }

        let shift_id = null
        if (req.user && order_type !== 'online') {
            const activeShift = await Shift.findOne({
                where: { user_id: req.user.userId, status: 'open' },
                transaction: t
            })
            if (!activeShift) {
                await t.rollback()
                return res.status(403).json({
                    message: 'يجب فتح وردية قبل إنشاء الطلب',
                    code: 'NO_ACTIVE_SHIFT'
                })
            }
            shift_id = activeShift.id
        }

        const sysSettings = loadSettings()
        const workflowSettings = sysSettings?.workflow || {}
        const onlineOrdersEnabled = workflowSettings.enableOnlineOrders !== false
        const autoAcceptOnline = workflowSettings.autoAcceptOnline === true

        if (order_type === 'online' && !onlineOrdersEnabled) {
            await t.rollback()
            return res.status(403).json({
                message: 'الطلبات الأونلاين معطلة حالياً من إعدادات النظام',
                code: 'ONLINE_ORDERS_DISABLED'
            })
        }

        let initialStatus = 'new'
        let payment_status_final = req.body.payment_status === 'paid' ? 'paid' : 'pending'
        let autoAcceptedOnline = false

        // Load workflow settings for auto-complete
        const autoComplete = workflowSettings.autoCompleteOrders === true

        if (order_type === 'online') {
            autoAcceptedOnline = autoAcceptOnline && (requestedPaymentMethod === 'cash' || payment_status_final === 'paid')
            initialStatus = autoAcceptedOnline ? 'approved' : 'pending'
        }

        if (requestedPaymentMethod === 'multi' && payment_status_final !== 'paid') {
            await t.rollback()
            return res.status(400).json({ message: 'الدفع المتعدد يتطلب أن تكون حالة الدفع مدفوعة' })
        }

        if (redeemPoints > 0 && payment_status_final !== 'paid') {
            await t.rollback()
            return res.status(400).json({ message: 'استخدام نقاط الولاء يتطلب طلبًا مدفوعًا' })
        }

        const supportsDeliveryTracking = ['delivery', 'online'].includes(order_type)
        if (!supportsDeliveryTracking && delivery_personnel_id) {
            await t.rollback()
            return res.status(400).json({ message: 'تعيين موظف التوصيل مسموح فقط لطلبات التوصيل أو الطلبات الأونلاين' })
        }

        let assignedRider = null
        if (supportsDeliveryTracking && delivery_personnel_id) {
            assignedRider = await DeliveryPersonnel.findByPk(delivery_personnel_id, { transaction: t })
            if (!assignedRider || !assignedRider.is_active) {
                await t.rollback()
                return res.status(400).json({ message: 'موظف الديليفري المحدد غير صالح أو غير نشط' })
            }
            if (assignedRider.branch_id && assignedRider.branch_id !== branch_id) {
                await t.rollback()
                return res.status(400).json({ message: 'موظف الديليفري لا يتبع نفس الفرع' })
            }
        }

        const normalizedDeliveryStatus = supportsDeliveryTracking
            ? String(delivery_status || '').trim().toLowerCase()
            : ''
        if (normalizedDeliveryStatus && !['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'].includes(normalizedDeliveryStatus)) {
            await t.rollback()
            return res.status(400).json({ message: 'حالة التوصيل غير صالحة' })
        }
        const effectiveDeliveryStatus = supportsDeliveryTracking
            ? (normalizedDeliveryStatus || (assignedRider ? 'assigned' : 'pending'))
            : null

        const order_number = await generateOrderNumber(sysSettings, t)

        const order = await Order.create({
            order_number,
            order_type,
            status: initialStatus,
            customer_id,
            branch_id,
            user_id: req.user?.userId || null,
            shift_id,
            subtotal: round2(pricingDraft.subtotal),
            tax: round2(pricingDraft.tax),
            discount: round2(pricingDraft.discount),
            total: round2(pricingDraft.total),
            payment_method: requestedPaymentMethod,
            payment_status: payment_status_final,
            price_list_id: price_list_id || null,
            promotion_discount: round2(pricingDraft.components?.promotionDiscount || 0),
            loyalty_discount: round2(pricingDraft.components?.loyaltyDiscount || 0),
            loyalty_points_redeemed: pricingDraft.applied?.loyalty?.pointsUsed || 0,
            loyalty_points_earned: 0,
            client_reference: normalizedClientRef,
            table_number: table_number || null,
            delivery_address: delivery_address || null,
            delivery_fee: parseFloat(delivery_fee || 0) || 0,
            delivery_personnel_id: supportsDeliveryTracking ? (assignedRider?.id || null) : null,
            delivery_status: effectiveDeliveryStatus,
            delivery_assigned_at: effectiveDeliveryStatus === 'assigned' ? new Date() : null,
            approved_by: autoAcceptedOnline ? (req.user?.userId || null) : null,
            approved_at: autoAcceptedOnline ? new Date() : null,
            notes: notes || null
        }, { transaction: t })

        if (assignedRider && assignedRider.status !== 'busy') {
            await assignedRider.update({ status: 'busy' }, { transaction: t })
        }

        const rows = (pricingDraft.orderItems || []).map((item) => ({
            order_id: order.id,
            menu_id: item.menu_id,
            item_name_ar: item.item_name_ar,
            item_name_en: item.item_name_en || null,
            quantity: item.quantity,
            unit_price: round2(item.unit_price),
            total_price: round2(item.total_price),
            batch_number: item.batch_number || null,
            notes: item.notes || null
        }))

        await OrderItem.bulkCreate(rows, { transaction: t })

        if (payment_status_final === 'paid') {
            const normalizedPayments = OrderPaymentService.normalizeBreakdown({
                paymentMethod: requestedPaymentMethod,
                paymentBreakdown: Array.isArray(payment_breakdown) ? payment_breakdown : null,
                totalAmount: order.total
            })

            await OrderPaymentService.replaceOrderPayments(order, normalizedPayments, {
                processedBy: req.user?.userId || null,
                notes: `Order payment row for ${order.order_number}`,
                transaction: t
            })
        }

        if (customer) {
            const totalOrders = parseInt(customer.total_orders || 0, 10) + 1
            const totalSpent = round2(parseFloat(customer.total_spent || 0) + parseFloat(order.total || 0))
            await customer.update({
                name: customer_name || customer.name,
                address: customer_address || customer.address,
                total_orders: totalOrders,
                total_spent: totalSpent
            }, { transaction: t })
        }

        if (pricingDraft.couponEntity) {
            const coupon = await Coupon.findByPk(pricingDraft.couponEntity.id, { transaction: t })
            if (coupon) {
                const currentUsage = parseInt(coupon.current_usage || 0, 10)
                await coupon.update({ current_usage: currentUsage + 1 }, { transaction: t })
            }
        }

        await t.commit()

        const created = await Order.findByPk(order.id, { include: buildIncludes() })

        const io = req.app.get('io')
        const notificationService = req.app.get('notificationService')
        if (io) {
            io.to(`branch:${branch_id}`).emit('order:new', { order: created })
            io.to(`order:${order.id}`).emit('order:updated', {
                orderId: order.id,
                status: order.status,
                order: created
            })
            if (['approved', 'new', 'confirmed', 'preparing', 'ready'].includes(order.status)) {
                io.to('kds:all').emit('order:new', created)
            }

            if (created?.order_type === 'online' && created?.status === 'pending') {
                // Backward-compatible realtime event for pending online orders
                io.to('role:cashier').emit('order:pending', created)
                io.to('role:manager').emit('order:pending', created)
                io.to('role:admin').emit('order:pending', created)
            }
        }

        if (notificationService?.orderPending && created?.order_type === 'online' && created?.status === 'pending') {
            notificationService.orderPending(created).catch((notifyErr) => {
                logger.warn('Order pending notification failed:', notifyErr.message)
            })
        }

        AuditService.logOrderCreated(req, created, rows)

        // --- Auto-Complete Mode ---
        // If autoCompleteOrders is ON and this is NOT an online order,
        // immediately finalize the order (stock deduction + accounting + loyalty)
        let finalOrder = created
        if (autoComplete && order_type !== 'online' && payment_status_final === 'paid') {
            try {
                finalOrder = await OrderFinalizationService.finalizeOrder(order.id, {
                    user: req.user,
                    paymentMethod: requestedPaymentMethod,
                    paymentBreakdown: Array.isArray(payment_breakdown) ? payment_breakdown : null,
                    warehouseId: req.body.warehouse_id || null
                })

                if (io) {
                    io.to(`branch:${branch_id}`).emit('order:completed', { order: finalOrder })
                }
                logger.info(`[AutoComplete] Order ${order.order_number} completed automatically`)
            } catch (autoErr) {
                // Don't fail the whole order if auto-complete fails
                logger.error(`[AutoComplete] Failed for order ${order.order_number}:`, autoErr.message)
                // Order stays as 'new' — cashier can complete manually
            }
        }

        res.status(201).json({
            success: true,
            message: autoComplete && finalOrder?.status === 'completed'
                ? 'تم إنشاء وإكمال الطلب تلقائياً'
                : 'تم إنشاء الطلب بنجاح',
            data: finalOrder,
            autoCompleted: autoComplete && finalOrder?.status === 'completed',
            autoAcceptedOnline,
            pricing: {
                subtotal: round2(pricingDraft.subtotal).toFixed(2),
                discount: round2(pricingDraft.discount).toFixed(2),
                tax: round2(pricingDraft.tax).toFixed(2),
                total: round2(pricingDraft.total).toFixed(2),
                loyaltyPointsRedeemed: pricingDraft.applied?.loyalty?.pointsUsed || 0,
                estimatedLoyaltyPointsToEarn: pricingDraft.applied?.loyalty?.estimatedEarnPoints || 0
            }
        })
    } catch (error) {
        logger.error('Create order error:', error)
        if (!t.finished) await t.rollback()
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

// Update order status (except final complete)
router.put(
    '/:id/status',
    authenticate,
    requirePermission(PERMISSIONS.ORDERS_PROCESS),
    updateOrderStatusValidator,
    validate,
    async (req, res) => {
    try {
        const { id } = req.params
        const { status, delivery_person } = req.body

        const order = await Order.findByPk(id)
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (!hasBranchAccess(req, order.branch_id)) {
            return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
        }

        const currentStatus = order.status
        if (currentStatus === status) {
            return res.json({ success: true, message: 'الحالة محدثة بالفعل', data: order })
        }

        const allowed = validTransitions[currentStatus] || []
        if (!allowed.includes(status)) {
            return res.status(400).json({
                message: `لا يمكن تغيير الحالة من "${currentStatus}" إلى "${status}"`,
                allowed
            })
        }

        const updateData = { status }
        if (status === 'ready') updateData.ready_at = new Date()
        if (status === 'handed_to_cashier') {
            updateData.handed_at = new Date()
            if (delivery_person) updateData.delivery_person = delivery_person
        }
        if (status === 'cancelled') updateData.cancelled_at = new Date()

        await order.update(updateData)

        const io = req.app.get('io')
        const notificationService = req.app.get('notificationService')
        if (io) {
            io.to(`branch:${order.branch_id}`).emit('order:updated', {
                orderId: order.id,
                status: order.status,
                order
            })
            io.to(`order:${order.id}`).emit('order:updated', {
                orderId: order.id,
                status: order.status
            })
            if (['preparing', 'ready'].includes(status)) {
                io.to('kds:all').emit('order:updated', {
                    orderId: order.id,
                    status: order.status,
                    order
                })
            }
            if (status === 'ready') {
                io.to('role:cashier').emit('order:ready_for_pickup', {
                    orderId: order.id,
                    orderNumber: order.order_number,
                    order
                })
                io.to('cashier').emit('order:ready_for_pickup', {
                    orderId: order.id,
                    orderNumber: order.order_number,
                    order
                })
            }
            if (status === 'approved') {
                io.to('kds:all').emit('order:new', order)
                io.to('kds').emit('order:new', order)
            }
        }

        if (status === 'ready' && notificationService?.orderReady) {
            notificationService.orderReady(order).catch((notifyErr) => {
                logger.warn('Order ready notification failed:', notifyErr.message)
            })
        }

        if (status === 'approved' && notificationService?.orderApproved) {
            notificationService.orderApproved(order).catch((notifyErr) => {
                logger.warn('Order approved notification failed:', notifyErr.message)
            })
        }

        AuditService.logOrderStatusChanged(req, order, currentStatus, status)

        res.json({ data: order, message: statusMessages[status] || 'Status updated' })
    } catch (error) {
        logger.error('Update order status error:', error)
        res.status(500).json({ message: error.message || 'فشل تحديث حالة الطلب' })
    }
    }
)

// Approve online order
router.post('/:id/approve', authenticate, authorize('admin', 'manager', 'cashier', 'supervisor'), async (req, res) => {
    try {
        const { id } = req.params

        const order = await Order.findByPk(id, { include: [{ model: OrderItem, as: 'items' }] })
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (!hasBranchAccess(req, order.branch_id)) {
            return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
        }

        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'الطلب ليس في حالة انتظار الموافقة' })
        }

        const activeShift = await Shift.findOne({ where: { user_id: req.user.userId, status: 'open' } })
        if (!activeShift) {
            return res.status(403).json({
                message: 'يجب فتح وردية قبل الموافقة على الطلب',
                code: 'NO_ACTIVE_SHIFT'
            })
        }

        await order.update({
            status: 'approved',
            user_id: req.user.userId,
            shift_id: activeShift.id,
            approved_by: req.user.userId,
            approved_at: new Date()
        })

        const io = req.app.get('io')
        const notificationService = req.app.get('notificationService')
        if (io) {
            io.to('kds:all').emit('order:new', order)
            io.to('kds').emit('order:new', order)
            io.to(`order:${order.id}`).emit('order:updated', { orderId: order.id, status: 'approved' })
        }

        if (notificationService?.orderApproved) {
            notificationService.orderApproved(order).catch((notifyErr) => {
                logger.warn('Order approved notification failed:', notifyErr.message)
            })
        }

        res.json({ success: true, message: 'تمت الموافقة على الطلب وإرساله للمطبخ', data: order })
    } catch (error) {
        logger.error('Approve order error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Handoff to cashier
router.post('/:id/handoff', authenticate, authorize('admin', 'manager', 'chef', 'cashier', 'supervisor'), async (req, res) => {
    try {
        const { id } = req.params

        const order = await Order.findByPk(id, { include: [{ model: OrderItem, as: 'items' }] })
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (!hasBranchAccess(req, order.branch_id)) {
            return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
        }

        if (order.status !== 'ready') {
            return res.status(400).json({ message: 'يجب أن يكون الطلب جاهزًا قبل التسليم للكاشير' })
        }

        await order.update({ status: 'handed_to_cashier', handed_at: new Date() })

        const io = req.app.get('io')
        if (io) {
            io.to('role:cashier').emit('order:handed', { order })
            io.to('cashier').emit('order:handed', { order })
            io.to('kds:all').emit('order:removed', { orderId: order.id })
            io.to('kds').emit('order:removed', { orderId: order.id })
        }

        res.json({ success: true, message: 'تم تسليم الطلب للكاشير', data: order })
    } catch (error) {
        logger.error('Handoff order error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Complete order (idempotent)
router.post('/:id/complete',
    authenticate,
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    requireIdempotency({ required: true, endpointName: 'order_complete' }),
    async (req, res) => {
        try {
            const { id } = req.params
            const { delivery_person, payment_method, payment_breakdown, warehouse_id } = req.body
            const assignedWarehouseId = req.user?.role === 'cashier'
                ? (String(req.user?.defaultWarehouseId || '').trim() || null)
                : null

            if (assignedWarehouseId && warehouse_id && String(warehouse_id) !== assignedWarehouseId) {
                return res.status(403).json({
                    success: false,
                    message: 'غير مصرح لك باستخدام مخزن غير المخزن المعيّن لك'
                })
            }

            const existingOrder = await Order.findByPk(id, { attributes: ['id', 'branch_id'] })
            if (!existingOrder) {
                return res.status(404).json({ success: false, message: 'الطلب غير موجود' })
            }
            if (!hasBranchAccess(req, existingOrder.branch_id)) {
                return res.status(403).json({ success: false, message: 'غير مصرح لك بهذا الإجراء' })
            }

            const effectiveWarehouseId = assignedWarehouseId || warehouse_id

            const order = await OrderFinalizationService.finalizeOrder(id, {
                user: req.user,
                deliveryPerson: delivery_person,
                paymentMethod: payment_method,
                paymentBreakdown: payment_breakdown,
                warehouseId: effectiveWarehouseId
            })

            const io = req.app.get('io')
            if (io) {
                io.to(`branch:${order.branch_id}`).emit('order:completed', { order })
                io.to('role:cashier').emit('order:removed', { orderId: order.id })
                io.to('cashier').emit('order:removed', { orderId: order.id })
            }

            res.json({ success: true, message: 'تم إكمال الطلب بنجاح', data: order })
        } catch (error) {
            logger.error('Complete order error:', error)

            const errorMap = {
                ORDER_NOT_FOUND: { status: 404, message: 'الطلب غير موجود' },
                ORDER_ALREADY_FINALIZED: { status: 400, message: 'الطلب مكتمل أو ملغي بالفعل' },
                INVALID_WAREHOUSE_FOR_BRANCH: { status: 400, message: 'المستودع المحدد غير صالح لهذا الفرع' },
                NO_DEFAULT_WAREHOUSE_FOR_BRANCH: { status: 500, message: 'لا يوجد مستودع افتراضي لهذا الفرع' }
            }

            const errorKey = Object.keys(errorMap).find((k) => error.message?.startsWith(k))
            if (errorKey) {
                return res.status(errorMap[errorKey].status).json({
                    success: false,
                    message: errorMap[errorKey].message
                })
            }

            if (error.message?.startsWith('STOCK_DEDUCTION_FAILED')) {
                return res.status(400).json({
                    success: false,
                    message: `فشل خصم المخزون: ${error.message.split(': ').slice(1).join(': ')}`
                })
            }

            if (error.message?.startsWith('PAYMENT_BREAKDOWN_') || error.message?.startsWith('PAYMENT_')) {
                return res.status(400).json({ success: false, message: error.message })
            }

            res.status(500).json({ message: 'فشل إكمال الطلب' })
        }
    }
)

// Cancel order
router.post('/:id/cancel', authenticate, requirePermission(PERMISSIONS.ORDERS_CANCEL), async (req, res) => {
    try {
        const { id } = req.params
        const { reason } = req.body
        const settings = loadSettings()
        const allowCancelWithoutReason = settings?.workflow?.allowCancelWithoutReason === true
        const normalizedReason = String(reason || '').trim()

        if (!allowCancelWithoutReason && !normalizedReason) {
            return res.status(400).json({
                message: 'سبب الإلغاء مطلوب حسب قواعد العمل الحالية',
                code: 'CANCEL_REASON_REQUIRED'
            })
        }

        const order = await Order.findByPk(id)
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        if (!hasBranchAccess(req, order.branch_id)) {
            return res.status(403).json({ message: 'غير مصرح لك بهذا الإجراء' })
        }

        if (['completed', 'cancelled'].includes(order.status)) {
            return res.status(400).json({ message: 'لا يمكن إلغاء هذا الطلب لأنه مكتمل أو ملغي بالفعل' })
        }

        const finalCancelReason = normalizedReason || 'غير محدد'

        await order.update({
            status: 'cancelled',
            notes: order.notes
                ? `${order.notes} | سبب الإلغاء: ${finalCancelReason}`
                : `سبب الإلغاء: ${finalCancelReason}`
        })

        const io = req.app.get('io')
        const notificationService = req.app.get('notificationService')
        if (io) {
            io.to(`branch:${order.branch_id}`).emit('order:cancelled', { orderId: order.id })
            io.to('kds:all').emit('order:cancelled', { orderId: order.id })
            io.to('kds').emit('order:cancelled', { orderId: order.id })
            io.to('role:cashier').emit('order:cancelled', { orderId: order.id })
            io.to('cashier').emit('order:cancelled', { orderId: order.id })
        }

        if (notificationService?.orderCancelled) {
            notificationService.orderCancelled(order, finalCancelReason).catch((notifyErr) => {
                logger.warn('Order cancelled notification failed:', notifyErr.message)
            })
        }

        res.json({ success: true, message: 'تم إلغاء الطلب بنجاح', data: order })
    } catch (error) {
        logger.error('Cancel order error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

module.exports = router
