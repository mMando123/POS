const express = require('express')
const router = express.Router()
const { body, param } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { User, Branch, Warehouse } = require('../models')
const { Op } = require('sequelize')
const { getAllRoles } = require('../config/permissions')
const AuditService = require('../services/auditService')

const USER_INCLUDE = [
    {
        model: Branch,
        attributes: ['id', 'name_ar']
    },
    {
        model: Warehouse,
        as: 'defaultWarehouse',
        attributes: ['id', 'name_ar', 'name_en', 'branch_id'],
        required: false
    }
]

const USER_SAFE_ATTRIBUTES = { exclude: ['password_hash'] }
const USER_ALLOWED_ROLES = getAllRoles()

const resolveDefaultWarehouseForBranch = async ({
    branchId,
    defaultWarehouseId,
    role,
    allowFallbackToNull = true
}) => {
    // Only cashier needs a forced selling warehouse assignment.
    if (role !== 'cashier') return null

    const normalized = String(defaultWarehouseId || '').trim()
    if (!normalized) {
        return allowFallbackToNull ? null : null
    }

    const warehouse = await Warehouse.findOne({
        where: {
            id: normalized,
            branch_id: branchId,
            status: 'active'
        },
        attributes: ['id']
    })

    if (!warehouse) {
        const error = new Error('DEFAULT_WAREHOUSE_INVALID_FOR_BRANCH')
        throw error
    }

    return warehouse.id
}

// Get all users (Admin only)
router.get('/', authenticate, requirePermission(PERMISSIONS.USERS_VIEW), async (req, res) => {
    try {
        const { role, is_active, search } = req.query

        const where = {}
        if (role) where.role = role
        if (is_active !== undefined) where.is_active = is_active === 'true'
        if (search) {
            where[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { name_ar: { [Op.like]: `%${search}%` } },
                { name_en: { [Op.like]: `%${search}%` } }
            ]
        }

        const users = await User.findAll({
            where,
            attributes: USER_SAFE_ATTRIBUTES,
            include: USER_INCLUDE,
            order: [['created_at', 'DESC']]
        })

        res.json({ data: users })
    } catch (error) {
        console.error('Get users error:', error)
        res.status(500).json({ message: 'خطأ في جلب المستخدمين' })
    }
})

// Get single user
router.get('/:id', authenticate, requirePermission(PERMISSIONS.USERS_VIEW), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: USER_SAFE_ATTRIBUTES,
            include: USER_INCLUDE
        })

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' })
        }

        res.json({ data: user })
    } catch (error) {
        console.error('Get user error:', error)
        res.status(500).json({ message: 'خطأ في جلب المستخدم' })
    }
})

// Get user activity history
router.get('/:id/history', authenticate, requirePermission(PERMISSIONS.USERS_VIEW), async (req, res) => {
    try {
        const { id } = req.params
        const {
            category,
            action,
            entity_type,
            entity_id,
            start_date,
            end_date,
            limit = 100,
            offset = 0
        } = req.query

        const user = await User.findByPk(id, { attributes: ['id', 'username', 'name_ar', 'role', 'branch_id'] })
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' })
        }

        // Non-admin cannot inspect users outside their branch
        if (
            req.user?.role !== 'admin' &&
            req.user?.branchId &&
            String(req.user.branchId) !== String(user.branch_id || '')
        ) {
            return res.status(403).json({ message: 'غير مصرح لك بعرض سجل هذا المستخدم' })
        }

        const result = await AuditService.getLogs({
            category: category || null,
            action: action || null,
            userId: id,
            entityType: entity_type || null,
            entityId: entity_id || null,
            startDate: start_date || null,
            endDate: end_date || null,
            limit: Math.min(parseInt(limit, 10) || 100, 500),
            offset: Math.max(parseInt(offset, 10) || 0, 0)
        })

        res.json({
            data: result.data,
            user,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                hasMore: result.offset + result.data.length < result.total
            }
        })
    } catch (error) {
        console.error('Get user activity history error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل نشاط المستخدم' })
    }
})

// Create new user (Admin only)
router.post(
    '/',
    authenticate,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    [
        body('username').trim().isLength({ min: 3 }).withMessage('اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
        body('password')
            .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
            .isAlphanumeric('en-US').withMessage('كلمة المرور يجب أن تحتوي على أحرف وأرقام إنجليزية فقط'),
        body('name_ar').trim().notEmpty().withMessage('الاسم بالعربية مطلوب'),
        body('role').isIn(USER_ALLOWED_ROLES).withMessage('الدور غير صالح'),
        body('branch_id').isUUID().withMessage('الفرع مطلوب'),
        body('default_warehouse_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('معرف مخزن الصرف غير صالح')
    ],
    validate,
    async (req, res) => {
        try {
            const {
                username,
                password,
                name_ar,
                name_en,
                role,
                branch_id,
                default_warehouse_id
            } = req.body

            const existingUser = await User.findOne({ where: { username } })
            if (existingUser) {
                return res.status(400).json({ message: 'اسم المستخدم موجود مسبقًا' })
            }

            const resolvedDefaultWarehouseId = await resolveDefaultWarehouseForBranch({
                branchId: branch_id,
                defaultWarehouseId: default_warehouse_id,
                role
            })

            const user = await User.create({
                username,
                password_hash: password,
                name_ar,
                name_en: name_en || name_ar,
                role,
                branch_id,
                default_warehouse_id: resolvedDefaultWarehouseId,
                is_active: true
            })

            const userData = await User.findByPk(user.id, {
                attributes: USER_SAFE_ATTRIBUTES,
                include: USER_INCLUDE
            })

            res.status(201).json({
                message: 'تم إنشاء المستخدم بنجاح',
                data: userData
            })
        } catch (error) {
            if (error.message === 'DEFAULT_WAREHOUSE_INVALID_FOR_BRANCH') {
                return res.status(400).json({
                    message: 'مخزن الصرف المحدد غير صالح أو لا ينتمي لنفس فرع المستخدم'
                })
            }

            console.error('Create user error:', error)
            res.status(500).json({ message: 'خطأ في إنشاء المستخدم' })
        }
    }
)

// Update user (Admin only)
router.put(
    '/:id',
    authenticate,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    [
        param('id').isUUID(),
        body('password')
            .optional()
            .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
            .isAlphanumeric('en-US').withMessage('كلمة المرور يجب أن تحتوي على أحرف وأرقام إنجليزية فقط'),
        body('name_ar').optional().trim().notEmpty().withMessage('الاسم بالعربية لا يمكن أن يكون فارغًا'),
        body('role').optional().isIn(USER_ALLOWED_ROLES).withMessage('الدور غير صالح'),
        body('branch_id').optional().isUUID().withMessage('الفرع غير صالح'),
        body('default_warehouse_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('معرف مخزن الصرف غير صالح')
    ],
    validate,
    async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id)
            if (!user) {
                return res.status(404).json({ message: 'المستخدم غير موجود' })
            }

            const {
                name_ar,
                name_en,
                role,
                branch_id,
                is_active,
                password
            } = req.body

            const targetRole = role !== undefined ? role : user.role
            const targetBranchId = branch_id !== undefined ? branch_id : user.branch_id
            const hasDefaultWarehouseField = Object.prototype.hasOwnProperty.call(req.body, 'default_warehouse_id')

            let targetDefaultWarehouseId = user.default_warehouse_id
            if (hasDefaultWarehouseField) {
                targetDefaultWarehouseId = req.body.default_warehouse_id || null
            }

            // If branch changed and no explicit default was provided,
            // we still need to validate existing assignment against new branch.
            if (branch_id !== undefined && !hasDefaultWarehouseField) {
                targetDefaultWarehouseId = user.default_warehouse_id || null
            }

            const resolvedDefaultWarehouseId = await resolveDefaultWarehouseForBranch({
                branchId: targetBranchId,
                defaultWarehouseId: targetDefaultWarehouseId,
                role: targetRole
            })

            if (name_ar !== undefined) user.name_ar = name_ar
            if (name_en !== undefined) user.name_en = name_en
            if (role !== undefined) user.role = role
            if (branch_id !== undefined) user.branch_id = branch_id
            if (is_active !== undefined) user.is_active = is_active
            user.default_warehouse_id = resolvedDefaultWarehouseId

            if (password && password.length >= 6) {
                user.password_hash = password
            }

            await user.save()

            const userData = await User.findByPk(user.id, {
                attributes: USER_SAFE_ATTRIBUTES,
                include: USER_INCLUDE
            })

            res.json({
                message: 'تم تحديث المستخدم بنجاح',
                data: userData
            })
        } catch (error) {
            if (error.message === 'DEFAULT_WAREHOUSE_INVALID_FOR_BRANCH') {
                return res.status(400).json({
                    message: 'مخزن الصرف المحدد غير صالح أو لا ينتمي لنفس فرع المستخدم'
                })
            }

            console.error('Update user error:', error)
            res.status(500).json({ message: 'خطأ في تحديث المستخدم' })
        }
    }
)

// Delete user (Admin only)
router.delete('/:id',
    authenticate,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id)
            if (!user) {
                return res.status(404).json({ message: 'المستخدم غير موجود' })
            }

            if (user.id === req.user.userId) {
                return res.status(400).json({ message: 'لا يمكنك حذف حسابك الخاص' })
            }

            await user.update({ is_active: false })

            res.json({ message: 'تم حذف المستخدم بنجاح' })
        } catch (error) {
            console.error('Delete user error:', error)
            res.status(500).json({ message: 'خطأ في حذف المستخدم' })
        }
    }
)

// Toggle user status
router.patch('/:id/status',
    authenticate,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id)
            if (!user) {
                return res.status(404).json({ message: 'المستخدم غير موجود' })
            }

            if (user.id === req.user.userId && user.is_active) {
                return res.status(400).json({ message: 'لا يمكنك إلغاء تفعيل حسابك الخاص' })
            }

            await user.update({ is_active: !user.is_active })

            res.json({
                message: user.is_active ? 'تم تفعيل المستخدم' : 'تم إلغاء تفعيل المستخدم',
                is_active: user.is_active
            })
        } catch (error) {
            console.error('Toggle user status error:', error)
            res.status(500).json({ message: 'خطأ في تغيير حالة المستخدم' })
        }
    }
)

// Get available roles
router.get('/meta/roles', authenticate, requirePermission(PERMISSIONS.USERS_VIEW), async (req, res) => {
    const { getAllRoles, ROLES } = require('../config/permissions')

    const roles = getAllRoles().map(role => ({
        value: role,
        label_ar: ROLES[role]?.name || role,
        label_en: ROLES[role]?.name_en || role
    }))

    res.json({ data: roles })
})

module.exports = router
