const express = require('express')
const { body, param, validationResult } = require('express-validator')
const { Op } = require('sequelize')
const router = express.Router()

const { authenticate, authorize } = require('../middleware/auth')
const { Branch, User } = require('../models')

// Get all branches
// Query:
//   ?includeInactive=true
router.get('/', authenticate, async (req, res) => {
    try {
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true'
        const where = {}
        if (!includeInactive) where.is_active = true

        const branches = await Branch.findAll({
            where,
            order: [['name_ar', 'ASC']]
        })

        res.json({ data: branches })
    } catch (error) {
        console.error('Get branches error:', error)
        res.status(500).json({ message: 'خطأ في جلب الفروع' })
    }
})

// Get single branch
router.get('/:id', authenticate, async (req, res) => {
    try {
        const branch = await Branch.findByPk(req.params.id)
        if (!branch) return res.status(404).json({ message: 'الفرع غير موجود' })
        res.json({ data: branch })
    } catch (error) {
        console.error('Get branch error:', error)
        res.status(500).json({ message: 'خطأ في جلب الفرع' })
    }
})

// Create branch (admin only)
router.post('/',
    authenticate,
    authorize('admin'),
    body('name_ar').trim().notEmpty().withMessage('اسم الفرع بالعربية مطلوب'),
    body('name_en').optional().isString(),
    body('address').optional().isString(),
    body('phone').optional().isString(),
    body('is_active').optional().isBoolean(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ message: 'بيانات غير صالحة', errors: errors.array() })
            }

            const nameAr = req.body.name_ar.trim()
            const existing = await Branch.findOne({ where: { name_ar: nameAr } })
            if (existing) {
                return res.status(400).json({ message: 'يوجد فرع بنفس الاسم العربي' })
            }

            const branch = await Branch.create({
                name_ar: nameAr,
                name_en: req.body.name_en?.trim() || null,
                address: req.body.address?.trim() || null,
                phone: req.body.phone?.trim() || null,
                is_active: req.body.is_active !== false
            })

            res.status(201).json({
                message: 'تم إنشاء الفرع بنجاح',
                data: branch
            })
        } catch (error) {
            console.error('Create branch error:', error)
            res.status(500).json({ message: 'خطأ في إنشاء الفرع' })
        }
    }
)

// Update branch (admin only)
router.put('/:id',
    authenticate,
    authorize('admin'),
    param('id').isUUID().withMessage('معرف الفرع غير صالح'),
    body('name_ar').optional().isString(),
    body('name_en').optional().isString(),
    body('address').optional({ nullable: true }).isString(),
    body('phone').optional({ nullable: true }).isString(),
    body('is_active').optional().isBoolean(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ message: 'بيانات غير صالحة', errors: errors.array() })
            }

            const branch = await Branch.findByPk(req.params.id)
            if (!branch) return res.status(404).json({ message: 'الفرع غير موجود' })

            const updates = {}
            if (Object.prototype.hasOwnProperty.call(req.body, 'name_ar')) {
                const nextNameAr = (req.body.name_ar || '').trim()
                if (!nextNameAr) {
                    return res.status(400).json({ message: 'اسم الفرع بالعربية مطلوب' })
                }
                const duplicate = await Branch.findOne({
                    where: {
                        name_ar: nextNameAr,
                        id: { [Op.ne]: branch.id }
                    }
                })
                if (duplicate) {
                    return res.status(400).json({ message: 'يوجد فرع آخر بنفس الاسم العربي' })
                }
                updates.name_ar = nextNameAr
            }
            if (Object.prototype.hasOwnProperty.call(req.body, 'name_en')) updates.name_en = req.body.name_en?.trim() || null
            if (Object.prototype.hasOwnProperty.call(req.body, 'address')) updates.address = req.body.address?.trim() || null
            if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) updates.phone = req.body.phone?.trim() || null
            if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) updates.is_active = !!req.body.is_active

            if (updates.is_active === false) {
                const activeUsers = await User.count({
                    where: { branch_id: branch.id, is_active: true }
                })
                if (activeUsers > 0) {
                    return res.status(400).json({
                        message: 'لا يمكن تعطيل الفرع لوجود مستخدمين نشطين مرتبطين به'
                    })
                }
            }

            await branch.update(updates)
            res.json({ message: 'تم تحديث الفرع بنجاح', data: branch })
        } catch (error) {
            console.error('Update branch error:', error)
            res.status(500).json({ message: 'خطأ في تحديث الفرع' })
        }
    }
)

// Toggle branch status (admin only)
router.patch('/:id/status',
    authenticate,
    authorize('admin'),
    param('id').isUUID().withMessage('معرف الفرع غير صالح'),
    body('is_active').isBoolean().withMessage('is_active مطلوب ويجب أن يكون true/false'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ message: 'بيانات غير صالحة', errors: errors.array() })
            }

            const branch = await Branch.findByPk(req.params.id)
            if (!branch) return res.status(404).json({ message: 'الفرع غير موجود' })

            const nextStatus = !!req.body.is_active
            if (!nextStatus) {
                const activeUsers = await User.count({
                    where: { branch_id: branch.id, is_active: true }
                })
                if (activeUsers > 0) {
                    return res.status(400).json({
                        message: 'لا يمكن تعطيل الفرع لوجود مستخدمين نشطين مرتبطين به'
                    })
                }
            }

            await branch.update({ is_active: nextStatus })
            res.json({
                message: nextStatus ? 'تم تفعيل الفرع' : 'تم تعطيل الفرع',
                data: branch
            })
        } catch (error) {
            console.error('Toggle branch status error:', error)
            res.status(500).json({ message: 'خطأ في تحديث حالة الفرع' })
        }
    }
)

module.exports = router

