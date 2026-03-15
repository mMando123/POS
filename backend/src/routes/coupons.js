const express = require('express')
const { body } = require('express-validator')
const { Op } = require('sequelize')
const { Coupon } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { validate } = require('../middleware/validate')

const router = express.Router()

const round2 = (v) => Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100

const normalizeCouponCode = (value) => {
    const raw = String(value || '').trim().replace(/\s+/g, '')
    if (!raw) return ''

    const ARABIC_INDIC_ZERO = 0x0660
    const EASTERN_ARABIC_ZERO = 0x06f0

    const normalizedDigits = raw.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (char) => {
        const code = char.charCodeAt(0)
        if (code >= 0x0660 && code <= 0x0669) {
            return String(code - ARABIC_INDIC_ZERO)
        }
        if (code >= 0x06f0 && code <= 0x06f9) {
            return String(code - EASTERN_ARABIC_ZERO)
        }
        return char
    })

    return normalizedDigits.toUpperCase()
}

const resolveBranchId = (req) => req.body?.branch_id || req.user?.branchId || req.user?.branch_id || null

const isTrueValue = (value, defaultValue = false) => {
    if (value == null) return defaultValue
    const normalized = String(value).trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

router.get('/', authenticate, async (req, res) => {
    try {
        const { active_only = 'false', code, branch_id } = req.query
        const where = {}

        if (String(active_only).toLowerCase() === 'true') where.is_active = true
        if (code) where.code = normalizeCouponCode(code)
        if (branch_id) where[Op.or] = [{ branch_id }, { branch_id: null }]

        const coupons = await Coupon.findAll({
            where,
            order: [['created_at', 'DESC']]
        })
        res.json({ data: coupons })
    } catch (error) {
        res.status(500).json({ message: error.message || 'تعذر تحميل الكوبونات' })
    }
})

router.post('/validate', authenticate, [
    body('code').notEmpty().withMessage('كود الكوبون مطلوب'),
    body('subtotal').isFloat({ gt: 0 }).withMessage('المجموع الفرعي يجب أن يكون أكبر من صفر'),
    validate
], async (req, res) => {
    try {
        const now = new Date()
        const code = normalizeCouponCode(req.body.code)
        const subtotal = round2(req.body.subtotal)
        const branchId = resolveBranchId(req)
        const allowCrossBranchFallback = isTrueValue(process.env.COUPON_ALLOW_CROSS_BRANCH_FALLBACK, true)

        if (!code) {
            return res.status(400).json({ message: 'كود الكوبون غير صالح' })
        }

        const branchScope = branchId
            ? [{ branch_id: null }, { branch_id: branchId }]
            : [{ branch_id: null }]

        let coupon = await Coupon.findOne({
            where: {
                code,
                is_active: true,
                [Op.or]: branchScope
            }
        })
        let usedCrossBranchFallback = false

        if (!coupon) {
            const activeCouponAnyBranch = await Coupon.findOne({
                where: { code, is_active: true }
            })

            if (!activeCouponAnyBranch) {
                return res.status(404).json({ message: 'الكوبون غير موجود' })
            }

            if (
                branchId &&
                activeCouponAnyBranch.branch_id &&
                String(activeCouponAnyBranch.branch_id) !== String(branchId)
            ) {
                if (!allowCrossBranchFallback) {
                    return res.status(400).json({
                        message: 'الكوبون موجود لكنه غير متاح لهذا الفرع'
                    })
                }
                usedCrossBranchFallback = true
            }

            coupon = activeCouponAnyBranch
        }

        if (coupon.starts_at && now < new Date(coupon.starts_at)) {
            return res.status(400).json({ message: 'الكوبون لم يبدأ بعد' })
        }
        if (coupon.ends_at && now > new Date(coupon.ends_at)) {
            return res.status(400).json({ message: 'انتهت صلاحية الكوبون' })
        }
        if (coupon.usage_limit && Number(coupon.used_count || 0) >= Number(coupon.usage_limit)) {
            return res.status(400).json({ message: 'تم الوصول إلى الحد الأقصى لاستخدام الكوبون' })
        }

        const minOrderAmount = round2(coupon.min_order_amount || 0)
        if (minOrderAmount > 0 && subtotal < minOrderAmount) {
            return res.status(400).json({ message: 'قيمة الطلب أقل من الحد الأدنى للكوبون' })
        }

        let discount = 0
        if (coupon.discount_type === 'percent') {
            discount = round2((subtotal * round2(coupon.discount_value || 0)) / 100)
        } else {
            discount = round2(coupon.discount_value || 0)
        }

        if (coupon.max_discount_amount) {
            discount = Math.min(discount, round2(coupon.max_discount_amount))
        }
        discount = Math.min(discount, subtotal)

        res.json({
            data: {
                coupon_id: coupon.id,
                code: coupon.code,
                name: coupon.name,
                discount_type: coupon.discount_type,
                discount_amount: round2(discount),
                subtotal,
                net_subtotal: round2(subtotal - discount),
                branch_scope_fallback: usedCrossBranchFallback
            }
        })
    } catch (error) {
        res.status(500).json({ message: error.message || 'تعذر التحقق من الكوبون' })
    }
})

router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('code').notEmpty().withMessage('كود الكوبون مطلوب'),
        body('name').notEmpty().withMessage('اسم الكوبون مطلوب'),
        body('discount_type').isIn(['percent', 'fixed']).withMessage('نوع الخصم غير صالح'),
        body('discount_value').isFloat({ gt: 0 }).withMessage('قيمة الخصم يجب أن تكون أكبر من صفر'),
        body('min_order_amount').optional().isFloat({ min: 0 }),
        body('max_discount_amount').optional().isFloat({ min: 0 }),
        body('usage_limit').optional().isInt({ min: 1 }),
        body('starts_at').optional().isISO8601(),
        body('ends_at').optional().isISO8601(),
        body('is_active').optional().isBoolean(),
        validate
    ],
    async (req, res) => {
        try {
            const code = normalizeCouponCode(req.body.code)
            const coupon = await Coupon.create({
                code,
                name: req.body.name,
                discount_type: req.body.discount_type,
                discount_value: round2(req.body.discount_value),
                min_order_amount: round2(req.body.min_order_amount || 0),
                max_discount_amount: req.body.max_discount_amount ? round2(req.body.max_discount_amount) : null,
                usage_limit: req.body.usage_limit || null,
                starts_at: req.body.starts_at || null,
                ends_at: req.body.ends_at || null,
                branch_id: req.body.branch_id || null,
                is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
                created_by: req.user.userId,
                notes: req.body.notes || null
            })
            res.status(201).json({ data: coupon })
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ message: 'كود الكوبون مستخدم بالفعل' })
            }
            res.status(500).json({ message: error.message || 'تعذر إنشاء الكوبون' })
        }
    }
)

router.put('/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name').optional().notEmpty(),
        body('discount_type').optional().isIn(['percent', 'fixed']),
        body('discount_value').optional().isFloat({ gt: 0 }),
        body('min_order_amount').optional().isFloat({ min: 0 }),
        body('max_discount_amount').optional().isFloat({ min: 0 }),
        body('usage_limit').optional().isInt({ min: 1 }),
        body('starts_at').optional().isISO8601(),
        body('ends_at').optional().isISO8601(),
        body('is_active').optional().isBoolean(),
        validate
    ],
    async (req, res) => {
        try {
            const coupon = await Coupon.findByPk(req.params.id)
            if (!coupon) return res.status(404).json({ message: 'الكوبون غير موجود' })

            const payload = {}
            if (req.body.code !== undefined) payload.code = normalizeCouponCode(req.body.code)
            if (req.body.name !== undefined) payload.name = req.body.name
            if (req.body.discount_type !== undefined) payload.discount_type = req.body.discount_type
            if (req.body.discount_value !== undefined) payload.discount_value = round2(req.body.discount_value)
            if (req.body.min_order_amount !== undefined) payload.min_order_amount = round2(req.body.min_order_amount)
            if (req.body.max_discount_amount !== undefined) payload.max_discount_amount = req.body.max_discount_amount === null ? null : round2(req.body.max_discount_amount)
            if (req.body.usage_limit !== undefined) payload.usage_limit = req.body.usage_limit
            if (req.body.starts_at !== undefined) payload.starts_at = req.body.starts_at
            if (req.body.ends_at !== undefined) payload.ends_at = req.body.ends_at
            if (req.body.is_active !== undefined) payload.is_active = Boolean(req.body.is_active)
            if (req.body.notes !== undefined) payload.notes = req.body.notes
            if (req.body.branch_id !== undefined) payload.branch_id = req.body.branch_id

            await coupon.update(payload)
            res.json({ data: coupon })
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ message: 'كود الكوبون مستخدم بالفعل' })
            }
            res.status(500).json({ message: error.message || 'تعذر تحديث الكوبون' })
        }
    }
)

module.exports = router
