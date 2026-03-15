/**
 * Warehouse API Routes
 * Manage warehouses (storage locations)
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { Warehouse, Branch, User, Stock } = require('../models')

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback
    if (typeof value === 'boolean') return value

    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
}

/**
 * GET /api/warehouses
 * List all warehouses
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { branch_id, status } = req.query

        const where = {}
        if (req.user?.role !== 'admin') {
            where.branch_id = req.user?.branchId || null
        } else if (branch_id) {
            where.branch_id = branch_id
        }
        if (status) where.status = status

        const warehouses = await Warehouse.findAll({
            where,
            include: [
                { model: Branch, attributes: ['id', 'name_ar', 'name_en'] },
                { model: User, as: 'manager', attributes: ['id', 'name_ar', 'name_en'] }
            ],
            order: [['is_default', 'DESC'], ['name_ar', 'ASC']]
        })

        const warehousesWithStats = await Promise.all(warehouses.map(async (w) => {
            const stocks = await Stock.findAll({
                where: { warehouse_id: w.id },
                attributes: ['quantity', 'avg_cost']
            })

            const totalItems = stocks.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0)
            const totalValue = stocks.reduce((sum, s) => sum + (parseFloat(s.quantity || 0) * parseFloat(s.avg_cost || 0)), 0)

            return {
                id: w.id,
                nameAr: w.name_ar,
                nameEn: w.name_en,
                branchId: w.branch_id,
                branchName: w.Branch?.name_ar,
                location: w.location,
                managerId: w.manager_id,
                managerName: w.manager?.name_ar,
                status: w.status,
                isDefault: Boolean(w.is_default),
                stats: {
                    productCount: stocks.length,
                    totalItems: Math.round(totalItems * 100) / 100,
                    totalValue: Math.round(totalValue * 100) / 100
                },
                createdAt: w.createdAt
            }
        }))

        res.json({ data: warehousesWithStats })
    } catch (error) {
        console.error('Get warehouses error:', error)
        res.status(500).json({ message: 'خطأ في جلب المستودعات' })
    }
})

/**
 * GET /api/warehouses/:id
 * Get warehouse details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const warehouse = await Warehouse.findByPk(req.params.id, {
            include: [
                { model: Branch, attributes: ['id', 'name_ar', 'name_en'] },
                { model: User, as: 'manager', attributes: ['id', 'name_ar', 'name_en'] }
            ]
        })

        if (!warehouse) {
            return res.status(404).json({ message: 'المستودع غير موجود' })
        }

        if (req.user?.role !== 'admin' && req.user?.branchId && warehouse.branch_id !== req.user.branchId) {
            return res.status(403).json({ message: 'غير مصرح لك بعرض مستودع خارج فرعك' })
        }

        res.json({ data: warehouse })
    } catch (error) {
        console.error('Get warehouse error:', error)
        res.status(500).json({ message: 'خطأ في جلب بيانات المستودع' })
    }
})

/**
 * POST /api/warehouses
 * Create a new warehouse
 */
router.post(
    '/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name_ar').notEmpty().withMessage('الاسم بالعربية مطلوب'),
        body('branch_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('معرف الفرع غير صالح')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            const { name_ar, name_en, branch_id, location, manager_id } = req.body
            const isDefault = parseBoolean(req.body?.is_default, false)

            const resolvedBranchId = req.user?.role === 'admin'
                ? (branch_id || req.user?.branchId || null)
                : (req.user?.branchId || null)

            if (!resolvedBranchId) {
                return res.status(400).json({ message: 'لا يمكن تحديد الفرع الحالي للمستودع' })
            }

            if (isDefault) {
                await Warehouse.update(
                    { is_default: false },
                    { where: { branch_id: resolvedBranchId } }
                )
            }

            const warehouse = await Warehouse.create({
                name_ar,
                name_en,
                branch_id: resolvedBranchId,
                location,
                manager_id,
                is_default: isDefault,
                status: 'active'
            })

            res.status(201).json({
                message: 'تم إنشاء المستودع بنجاح',
                data: warehouse
            })
        } catch (error) {
            console.error('Create warehouse error:', error)
            res.status(500).json({ message: 'خطأ في إنشاء المستودع' })
        }
    }
)

/**
 * PUT /api/warehouses/:id
 * Update a warehouse
 */
router.put(
    '/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('branch_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('معرف الفرع غير صالح')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            const warehouse = await Warehouse.findByPk(req.params.id)

            if (!warehouse) {
                return res.status(404).json({ message: 'المستودع غير موجود' })
            }

            if (req.user?.role !== 'admin' && req.user?.branchId && warehouse.branch_id !== req.user.branchId) {
                return res.status(403).json({ message: 'غير مصرح لك بتعديل مستودع خارج فرعك' })
            }

            const { name_ar, name_en, location, manager_id, status, branch_id } = req.body
            const branchWillChange = req.user?.role === 'admin' && branch_id && branch_id !== warehouse.branch_id
            const targetBranchId = branchWillChange ? branch_id : warehouse.branch_id

            if (req.user?.role !== 'admin' && branch_id && branch_id !== warehouse.branch_id) {
                return res.status(403).json({ message: 'لا يمكن تعديل الفرع إلا بواسطة الأدمن' })
            }

            const hasIsDefaultField = Object.prototype.hasOwnProperty.call(req.body, 'is_default')
            const requestedIsDefault = hasIsDefaultField
                ? parseBoolean(req.body.is_default, Boolean(warehouse.is_default))
                : Boolean(warehouse.is_default)

            if (requestedIsDefault) {
                await Warehouse.update(
                    { is_default: false },
                    { where: { branch_id: targetBranchId } }
                )
            }

            await warehouse.update({
                name_ar: name_ar ?? warehouse.name_ar,
                name_en: name_en ?? warehouse.name_en,
                branch_id: targetBranchId,
                location: location ?? warehouse.location,
                manager_id: manager_id ?? warehouse.manager_id,
                status: status ?? warehouse.status,
                is_default: requestedIsDefault
            })

            res.json({
                message: 'تم تحديث المستودع بنجاح',
                data: warehouse
            })
        } catch (error) {
            console.error('Update warehouse error:', error)
            res.status(500).json({ message: 'خطأ في تحديث المستودع' })
        }
    }
)

/**
 * DELETE /api/warehouses/:id
 * Deactivate a warehouse (soft delete)
 */
router.delete('/:id',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const warehouse = await Warehouse.findByPk(req.params.id)

            if (!warehouse) {
                return res.status(404).json({ message: 'المستودع غير موجود' })
            }

            if (req.user?.role !== 'admin' && req.user?.branchId && warehouse.branch_id !== req.user.branchId) {
                return res.status(403).json({ message: 'غير مصرح لك بحذف مستودع خارج فرعك' })
            }

            if (warehouse.is_default) {
                return res.status(400).json({ message: 'لا يمكن حذف المستودع الافتراضي' })
            }

            const stockCount = await Stock.count({ where: { warehouse_id: warehouse.id } })
            if (stockCount > 0) {
                return res.status(400).json({
                    message: 'لا يمكن حذف مستودع يحتوي على منتجات. قم بنقل المخزون أولًا'
                })
            }

            await warehouse.update({ status: 'inactive' })

            res.json({ message: 'تم إلغاء تفعيل المستودع' })
        } catch (error) {
            console.error('Delete warehouse error:', error)
            res.status(500).json({ message: 'خطأ في حذف المستودع' })
        }
    }
)

module.exports = router
