const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { Category, Branch } = require('../models')

const emitCategoryUpdate = (req, branchId, payload) => {
    if (!branchId) return
    const io = req.app.get('io')
    if (!io) return
    io.to(`branch:${branchId}`).emit('category:updated', payload)
}

const resolveCategoryBranchId = async (req, requestedBranchId) => {
    if (req.user.role !== 'admin') {
        return req.user.branchId || null
    }

    if (requestedBranchId) {
        return requestedBranchId
    }

    if (req.user.branchId) {
        return req.user.branchId
    }

    const fallbackBranch = await Branch.findOne({
        where: { is_active: true },
        attributes: ['id'],
        order: [['created_at', 'ASC']]
    })

    return fallbackBranch?.id || null
}

const ensureBranchExists = async (branchId) => {
    if (!branchId) return false

    const branch = await Branch.findOne({
        where: { id: branchId, is_active: true },
        attributes: ['id']
    })

    return Boolean(branch)
}

// Get all categories
router.get('/', async (req, res) => {
    try {
        const { active_only } = req.query

        const where = {}
        if (active_only === 'true') {
            where.is_active = true
        }

        const categories = await Category.findAll({
            where,
            order: [['display_order', 'ASC'], ['name_ar', 'ASC']]
        })

        res.json({ data: categories })
    } catch (error) {
        console.error('Get categories error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Create category
router.post(
    '/',
    authenticate,
    requirePermission(PERMISSIONS.CATEGORY_MANAGE),
    [
        body('name_ar').trim().notEmpty().withMessage('اسم التصنيف بالعربية مطلوب'),
        body('name_en').optional({ nullable: true }).isString(),
        body('display_order').optional().isInt({ min: 0 }),
        body('branch_id').optional({ nullable: true }).isUUID().withMessage('معرف الفرع غير صالح'),
        validate
    ],
    async (req, res) => {
        try {
            const nameAr = String(req.body.name_ar || '').trim()
            const nameEn = req.body.name_en ? String(req.body.name_en).trim() : null
            const displayOrder = req.body.display_order !== undefined ? Number(req.body.display_order) : 0
            const requestedBranchId = req.body.branch_id || null

            const branchId = await resolveCategoryBranchId(req, requestedBranchId)
            if (!branchId) {
                return res.status(400).json({ message: 'لا يوجد فرع صالح لإضافة التصنيف' })
            }

            const branchExists = await ensureBranchExists(branchId)
            if (!branchExists) {
                return res.status(400).json({ message: 'الفرع المحدد غير موجود أو غير نشط' })
            }

            const existing = await Category.findOne({
                where: {
                    branch_id: branchId,
                    name_ar: nameAr
                },
                attributes: ['id']
            })

            if (existing) {
                return res.status(409).json({ message: 'هذا التصنيف موجود بالفعل في نفس الفرع' })
            }

            const category = await Category.create({
                name_ar: nameAr,
                name_en: nameEn,
                display_order: displayOrder,
                branch_id: branchId
            })

            emitCategoryUpdate(req, branchId, {
                action: 'created',
                category
            })

            return res.status(201).json({ data: category })
        } catch (error) {
            console.error('Create category error:', error)
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ message: 'هذا التصنيف موجود بالفعل' })
            }
            return res.status(500).json({ message: 'خطأ في الخادم' })
        }
    }
)

// Update category
router.put(
    '/:id',
    authenticate,
    requirePermission(PERMISSIONS.CATEGORY_MANAGE),
    [
        body('name_ar').optional().trim().notEmpty().withMessage('اسم التصنيف لا يمكن أن يكون فارغاً'),
        body('name_en').optional({ nullable: true }).isString(),
        body('display_order').optional().isInt({ min: 0 }),
        body('is_active').optional().isBoolean(),
        body('branch_id').optional({ nullable: true }).isUUID().withMessage('معرف الفرع غير صالح'),
        validate
    ],
    async (req, res) => {
        try {
            const { id } = req.params

            if (req.user.role !== 'admin' && !req.user.branchId) {
                return res.status(403).json({ message: 'لا يوجد فرع مرتبط بالمستخدم' })
            }

            const where = req.user.role === 'admin'
                ? { id }
                : { id, branch_id: req.user.branchId }

            const category = await Category.findOne({ where })
            if (!category) {
                return res.status(404).json({ message: 'التصنيف غير موجود' })
            }

            const updates = {}
            if (req.body.name_ar !== undefined) updates.name_ar = String(req.body.name_ar).trim()
            if (req.body.name_en !== undefined) updates.name_en = req.body.name_en ? String(req.body.name_en).trim() : null
            if (req.body.display_order !== undefined) updates.display_order = Number(req.body.display_order)
            if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active)

            if (req.body.branch_id !== undefined) {
                if (req.user.role !== 'admin') {
                    return res.status(403).json({ message: 'غير مسموح بتغيير الفرع' })
                }
                const branchExists = await ensureBranchExists(req.body.branch_id)
                if (!branchExists) {
                    return res.status(400).json({ message: 'الفرع المحدد غير موجود أو غير نشط' })
                }
                updates.branch_id = req.body.branch_id
            }

            const targetNameAr = updates.name_ar ?? category.name_ar
            const targetBranchId = updates.branch_id ?? category.branch_id

            const duplicate = await Category.findOne({
                where: {
                    name_ar: targetNameAr,
                    branch_id: targetBranchId,
                    id: { [Op.ne]: category.id }
                },
                attributes: ['id']
            })

            if (duplicate) {
                return res.status(409).json({ message: 'يوجد تصنيف بنفس الاسم في هذا الفرع' })
            }

            const previousBranchId = category.branch_id
            await category.update(updates)

            emitCategoryUpdate(req, category.branch_id, {
                action: 'updated',
                category
            })

            if (previousBranchId && previousBranchId !== category.branch_id) {
                emitCategoryUpdate(req, previousBranchId, {
                    action: 'deleted',
                    categoryId: category.id
                })
            }

            return res.json({ data: category })
        } catch (error) {
            console.error('Update category error:', error)
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ message: 'هذا التصنيف موجود بالفعل' })
            }
            return res.status(500).json({ message: 'خطأ في الخادم' })
        }
    }
)

// Delete category
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
    try {
        const { id } = req.params

        if (req.user.role !== 'admin' && !req.user.branchId) {
            return res.status(403).json({ message: 'لا يوجد فرع مرتبط بالمستخدم' })
        }

        const where = req.user.role === 'admin'
            ? { id }
            : { id, branch_id: req.user.branchId }

        const category = await Category.findOne({ where })
        if (!category) {
            return res.status(404).json({ message: 'التصنيف غير موجود' })
        }

        const branchId = category.branch_id
        await category.destroy()

        emitCategoryUpdate(req, branchId, {
            action: 'deleted',
            categoryId: id
        })

        return res.json({ message: 'تم حذف التصنيف بنجاح' })
    } catch (error) {
        console.error('Delete category error:', error)
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(409).json({ message: 'لا يمكن حذف التصنيف لأنه مرتبط بعناصر أخرى' })
        }
        return res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

module.exports = router
