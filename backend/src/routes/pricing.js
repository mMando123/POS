const express = require('express')
const { body, param, query } = require('express-validator')
const { Op } = require('sequelize')
const { validate } = require('../middleware/validate')
const { authenticate, optionalAuth, authorize } = require('../middleware/auth')
const { PriceList, PriceListItem, PromotionRule, Customer, Menu, sequelize } = require('../models')
const PricingService = require('../services/pricingService')

const router = express.Router()

const mapPricingError = (error) => {
    const messageMap = {
        COUPON_NOT_FOUND: 'الكوبون غير موجود',
        COUPON_BRANCH_MISMATCH: 'الكوبون موجود لكنه غير متاح لهذا الفرع',
        COUPON_NOT_STARTED: 'الكوبون غير مفعل بعد',
        COUPON_EXPIRED: 'انتهت صلاحية الكوبون',
        COUPON_MIN_ORDER_NOT_MET: 'قيمة الطلب أقل من الحد الأدنى للكوبون',
        COUPON_USAGE_LIMIT_REACHED: 'تم الوصول للحد الأقصى لاستخدام الكوبون',
        COUPON_DISCOUNT_ZERO: 'الكوبون لا ينطبق على هذا الطلب',
        LOYALTY_CUSTOMER_REQUIRED: 'يجب تحديد عميل لاستخدام نقاط الولاء',
        LOYALTY_POINTS_INSUFFICIENT: 'نقاط الولاء غير كافية',
        ORDER_ITEMS_REQUIRED: 'يجب إضافة منتج واحد على الأقل'
    }

    if (!error?.message) return 'فشل في حساب التسعير'
    return messageMap[error.message] || error.message
}

router.post('/preview', optionalAuth, [
    body('items').isArray({ min: 1 }).withMessage('items is required'),
    body('items.*.menu_id').isUUID().withMessage('Invalid menu_id'),
    body('items.*.quantity').isInt({ min: 1, max: 1000 }).withMessage('Invalid quantity'),
    body('items.*.batch_number').optional().isLength({ max: 50 }),
    body('coupon_code').optional().isLength({ min: 2, max: 50 }),
    body('manual_discount').optional().isFloat({ min: 0 }),
    body('redeem_points').optional().isInt({ min: 0 }),
    body('price_list_id').optional().isUUID(),
    body('branch_id').optional().isUUID(),
    validate
], async (req, res) => {
    try {
        const {
            items,
            coupon_code,
            manual_discount,
            redeem_points,
            price_list_id,
            customer_phone,
            branch_id
        } = req.body

        const branchId = branch_id || req.user?.branchId || req.user?.branch_id
        if (!branchId) {
            return res.status(400).json({ message: 'الفرع مطلوب لمعاينة التسعير' })
        }

        let customer = null
        if (customer_phone) {
            customer = await Customer.findOne({ where: { phone: customer_phone } })
        }

        const pricing = await PricingService.buildOrderDraft({
            branchId,
            items,
            manualDiscount: manual_discount || 0,
            couponCode: coupon_code || null,
            customer,
            redeemPoints: redeem_points || 0,
            priceListId: price_list_id || null
        })

        res.json({
            data: {
                branch_id: branchId,
                subtotal: pricing.subtotal.toFixed(2),
                discount: pricing.discount.toFixed(2),
                tax: pricing.tax.toFixed(2),
                total: pricing.total.toFixed(2),
                components: {
                    price_list_savings: pricing.components.priceListSavings.toFixed(2),
                    promotion_discount: pricing.components.promotionDiscount.toFixed(2),
                    manual_discount: pricing.components.manualDiscount.toFixed(2),
                    coupon_discount: pricing.components.couponDiscount.toFixed(2),
                    loyalty_discount: pricing.components.loyaltyDiscount.toFixed(2)
                },
                applied: {
                    price_lists: pricing.applied.priceLists,
                    promotions: pricing.applied.promotions,
                    coupon: pricing.applied.coupon,
                    loyalty: pricing.applied.loyalty
                },
                items: pricing.orderItems.map((x) => ({
                    menu_id: x.menu_id,
                    item_name_ar: x.item_name_ar,
                    quantity: x.quantity,
                    unit_price: PricingService.round2(x.unit_price).toFixed(2),
                    total_price: PricingService.round2(x.total_price).toFixed(2),
                    batch_number: x.batch_number
                }))
            }
        })
    } catch (error) {
        res.status(400).json({ message: mapPricingError(error), code: error.message || 'PRICING_ERROR' })
    }
})

router.get('/price-lists', authenticate, async (req, res) => {
    try {
        const { branch_id, active_only } = req.query
        const where = {}
        if (branch_id) where[Op.or] = [{ branch_id: null }, { branch_id }]
        if (active_only === 'true') where.is_active = true

        const lists = await PriceList.findAll({
            where,
            include: [{
                model: PriceListItem,
                as: 'items',
                required: false,
                include: [{ model: Menu, as: 'menu', attributes: ['id', 'name_ar', 'name_en', 'sku', 'barcode'] }]
            }],
            order: [['priority', 'DESC'], ['name', 'ASC']]
        })

        res.json({ data: lists })
    } catch (error) {
        res.status(500).json({ message: error.message || 'Failed to load price lists' })
    }
})

router.post('/price-lists', authenticate, authorize('admin', 'manager'), [
    body('name').notEmpty().withMessage('name is required'),
    body('branch_id').optional({ nullable: true }).isUUID(),
    body('priority').optional().isInt(),
    body('items').optional().isArray(),
    body('items.*.menu_id').optional().isUUID(),
    body('items.*.price').optional().isFloat({ gt: 0 }),
    body('items.*.min_quantity').optional().isInt({ min: 1 }),
    validate
], async (req, res) => {
    const transaction = await sequelize.transaction()
    try {
        const payload = req.body
        const list = await PriceList.create({
            name: payload.name,
            description: payload.description || null,
            branch_id: payload.branch_id || null,
            priority: parseInt(payload.priority || 0, 10),
            auto_apply: payload.auto_apply !== false,
            starts_at: payload.starts_at || null,
            ends_at: payload.ends_at || null,
            is_active: payload.is_active !== false
        }, { transaction })

        if (Array.isArray(payload.items) && payload.items.length) {
            const rows = payload.items
                .filter((x) => x.menu_id && x.price)
                .map((x) => ({
                    price_list_id: list.id,
                    menu_id: x.menu_id,
                    price: PricingService.round2(x.price),
                    min_quantity: Math.max(1, parseInt(x.min_quantity || 1, 10)),
                    is_active: x.is_active !== false
                }))
            if (rows.length) {
                await PriceListItem.bulkCreate(rows, { transaction })
            }
        }

        await transaction.commit()
        const created = await PriceList.findByPk(list.id, { include: [{ model: PriceListItem, as: 'items' }] })
        res.status(201).json({ data: created })
    } catch (error) {
        if (!transaction.finished) await transaction.rollback()
        res.status(500).json({ message: error.message || 'Failed to create price list' })
    }
})

router.put('/price-lists/:id', authenticate, authorize('admin', 'manager'), [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('branch_id').optional({ nullable: true }).isUUID(),
    body('items').optional().isArray(),
    body('items.*.menu_id').optional().isUUID(),
    body('items.*.price').optional().isFloat({ gt: 0 }),
    validate
], async (req, res) => {
    const transaction = await sequelize.transaction()
    try {
        const list = await PriceList.findByPk(req.params.id, { transaction })
        if (!list) {
            await transaction.rollback()
            return res.status(404).json({ message: 'Price list not found' })
        }

        await list.update({
            name: req.body.name ?? list.name,
            description: req.body.description ?? list.description,
            branch_id: req.body.branch_id ?? list.branch_id,
            priority: req.body.priority ?? list.priority,
            auto_apply: req.body.auto_apply ?? list.auto_apply,
            starts_at: req.body.starts_at ?? list.starts_at,
            ends_at: req.body.ends_at ?? list.ends_at,
            is_active: req.body.is_active ?? list.is_active
        }, { transaction })

        if (Array.isArray(req.body.items)) {
            await PriceListItem.destroy({ where: { price_list_id: list.id }, transaction })
            const rows = req.body.items
                .filter((x) => x.menu_id && x.price)
                .map((x) => ({
                    price_list_id: list.id,
                    menu_id: x.menu_id,
                    price: PricingService.round2(x.price),
                    min_quantity: Math.max(1, parseInt(x.min_quantity || 1, 10)),
                    is_active: x.is_active !== false
                }))
            if (rows.length) {
                await PriceListItem.bulkCreate(rows, { transaction })
            }
        }

        await transaction.commit()
        const updated = await PriceList.findByPk(list.id, { include: [{ model: PriceListItem, as: 'items' }] })
        res.json({ data: updated })
    } catch (error) {
        if (!transaction.finished) await transaction.rollback()
        res.status(500).json({ message: error.message || 'Failed to update price list' })
    }
})

router.get('/promotions', authenticate, authorize('admin', 'manager'), [
    query('branch_id').optional().isUUID(),
    validate
], async (req, res) => {
    try {
        const where = {}
        if (req.query.branch_id) where[Op.or] = [{ branch_id: null }, { branch_id: req.query.branch_id }]
        if (req.query.active_only === 'true') where.is_active = true

        const rows = await PromotionRule.findAll({
            where,
            include: [{ model: Menu, as: 'menu', required: false, attributes: ['id', 'name_ar', 'name_en'] }],
            order: [['priority', 'DESC'], ['name', 'ASC']]
        })
        res.json({ data: rows })
    } catch (error) {
        res.status(500).json({ message: error.message || 'Failed to load promotions' })
    }
})

router.post('/promotions', authenticate, authorize('admin', 'manager'), [
    body('name').notEmpty(),
    body('branch_id').optional({ nullable: true }).isUUID(),
    body('applies_to').isIn(['order', 'item']),
    body('menu_id').optional({ nullable: true }).isUUID(),
    body('discount_type').isIn(['percent', 'fixed']),
    body('discount_value').isFloat({ gt: 0 }),
    body('min_order_amount').optional().isFloat({ min: 0 }),
    body('min_quantity').optional().isInt({ min: 1 }),
    body('max_discount_amount').optional({ nullable: true }).isFloat({ gt: 0 }),
    validate
], async (req, res) => {
    try {
        const payload = req.body
        const promotion = await PromotionRule.create({
            name: payload.name,
            description: payload.description || null,
            branch_id: payload.branch_id || null,
            applies_to: payload.applies_to,
            menu_id: payload.menu_id || null,
            discount_type: payload.discount_type,
            discount_value: PricingService.round2(payload.discount_value),
            min_order_amount: PricingService.round2(payload.min_order_amount || 0),
            min_quantity: parseInt(payload.min_quantity || 1, 10),
            max_discount_amount: payload.max_discount_amount ? PricingService.round2(payload.max_discount_amount) : null,
            stackable: payload.stackable === true,
            priority: parseInt(payload.priority || 0, 10),
            starts_at: payload.starts_at || null,
            ends_at: payload.ends_at || null,
            is_active: payload.is_active !== false
        })
        res.status(201).json({ data: promotion })
    } catch (error) {
        res.status(500).json({ message: error.message || 'Failed to create promotion' })
    }
})

router.put('/promotions/:id', authenticate, authorize('admin', 'manager'), [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('branch_id').optional({ nullable: true }).isUUID(),
    body('applies_to').optional().isIn(['order', 'item']),
    body('menu_id').optional({ nullable: true }).isUUID(),
    body('discount_type').optional().isIn(['percent', 'fixed']),
    body('discount_value').optional().isFloat({ gt: 0 }),
    body('min_order_amount').optional().isFloat({ min: 0 }),
    body('min_quantity').optional().isInt({ min: 1 }),
    body('max_discount_amount').optional({ nullable: true }).isFloat({ gt: 0 }),
    validate
], async (req, res) => {
    try {
        const promotion = await PromotionRule.findByPk(req.params.id)
        if (!promotion) return res.status(404).json({ message: 'Promotion not found' })

        await promotion.update({
            name: req.body.name ?? promotion.name,
            description: req.body.description ?? promotion.description,
            branch_id: req.body.branch_id ?? promotion.branch_id,
            applies_to: req.body.applies_to ?? promotion.applies_to,
            menu_id: req.body.menu_id ?? promotion.menu_id,
            discount_type: req.body.discount_type ?? promotion.discount_type,
            discount_value: req.body.discount_value !== undefined
                ? PricingService.round2(req.body.discount_value)
                : promotion.discount_value,
            min_order_amount: req.body.min_order_amount !== undefined
                ? PricingService.round2(req.body.min_order_amount)
                : promotion.min_order_amount,
            min_quantity: req.body.min_quantity ?? promotion.min_quantity,
            max_discount_amount: req.body.max_discount_amount !== undefined
                ? (req.body.max_discount_amount ? PricingService.round2(req.body.max_discount_amount) : null)
                : promotion.max_discount_amount,
            stackable: req.body.stackable ?? promotion.stackable,
            priority: req.body.priority ?? promotion.priority,
            starts_at: req.body.starts_at ?? promotion.starts_at,
            ends_at: req.body.ends_at ?? promotion.ends_at,
            is_active: req.body.is_active ?? promotion.is_active
        })

        res.json({ data: promotion })
    } catch (error) {
        res.status(500).json({ message: error.message || 'Failed to update promotion' })
    }
})

module.exports = router
